"""
ALMA Studio API
─────────────────────────────────────────────────────────────────────────────
Endpoints for the admin interface:
  - PDF upload & AI-powered assessment parsing
  - Manual assessment editing
  - Version management
─────────────────────────────────────────────────────────────────────────────
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_db
from app.config import get_settings
from app.models.assessment import Assessment, AssessmentVersion, Question, AnswerOption, QuestionType
from app.models.session import AssessmentSession
import httpx
import pypdf
import io
from datetime import datetime, timezone

router = APIRouter(prefix="/studio", tags=["studio"])
settings = get_settings()

_DEFAULT_EXPORT_CONFIG = {
    "hl7_oru": {"enabled": False},
    "hl7_mdm": {"enabled": False},
    "fhir":    {"enabled": False},
}


# ──────────────────────────────────────────
# Dashboard Stats
# ──────────────────────────────────────────

@router.get("/stats")
async def get_studio_stats(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Dashboard statistics for a given tenant:
    - active_versions: AssessmentVersions with is_active=True belonging to this tenant
    - sessions_today:  AssessmentSessions started since 00:00 UTC today
    """
    # Count active versions on published assessments only
    active_versions_result = await db.execute(
        select(func.count(AssessmentVersion.id))
        .join(Assessment, AssessmentVersion.assessment_id == Assessment.id)
        .where(Assessment.tenant_id == tenant_id)
        .where(Assessment.status == "published")
        .where(AssessmentVersion.is_active == True)  # noqa: E712
    )
    active_versions = active_versions_result.scalar() or 0

    # Count sessions today (midnight UTC)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    sessions_today_result = await db.execute(
        select(func.count(AssessmentSession.id))
        .where(AssessmentSession.tenant_id == tenant_id)
        .where(AssessmentSession.started_at >= today_start)
    )
    sessions_today = sessions_today_result.scalar() or 0

    return {
        "active_versions": active_versions,
        "sessions_today": sessions_today,
    }


# ──────────────────────────────────────────
# PDF Upload + AI Parsing
# ──────────────────────────────────────────

@router.post("/upload-pdf")
async def upload_and_parse_pdf(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    source_url: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    """
    1. Accept a PDF upload
    2. Extract text via pypdf
    3. Send to Claude for structured assessment extraction
    4. Return draft JSON — NOT yet saved to DB (user reviews first)
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    # Save the file
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{file_id}.pdf")
    with open(file_path, "wb") as f:
        f.write(content)

    # Native PDF parsing — try Claude first (best quality), fall back to Gemini native
    parsed = None
    if settings.anthropic_api_key:
        try:
            parsed = await _parse_pdf_with_claude(content)
        except Exception:
            parsed = None  # fall through to Gemini
    if parsed is None:
        parsed = await _parse_pdf_with_gemini_native(content)

    # pypdf preview for debug/transparency (best-effort)
    pdf_text_preview = ""
    try:
        pdf_text_preview = _extract_pdf_text(content)[:500]
    except Exception:
        pass

    return {
        "file_id": file_id,
        "filename": file.filename,
        "parsed_draft": parsed,
        "pdf_text_preview": pdf_text_preview,
    }


@router.post("/parse-url")
async def parse_from_url(payload: dict, db: AsyncSession = Depends(get_db)):
    """Parse an assessment from a URL reference (Claude reads the description)."""
    url = payload.get("url", "")
    description = payload.get("description", "")

    if not url and not description:
        raise HTTPException(status_code=400, detail="Either url or description required")

    prompt = f"""
Du bist ein Experte für psychiatrische Assessments.
Erstelle eine strukturierte JSON-Darstellung des folgenden Assessments.

URL/Referenz: {url}
Beschreibung: {description}

Antworte NUR mit gültigem JSON im folgenden Format (ohne Markdown-Backticks):
{{
  "name": "Vollständiger Name",
  "abbreviation": "Kürzel",
  "description": "Kurzbeschreibung",
  "scoring_logic": "sum|honos|phq9|...",
  "questions": [
    {{
      "key": "item_1",
      "text": "Fragetext",
      "type": "scale|single_select|multi_select|checkbox|text|number",
      "is_required": true,
      "skip_value": null,
      "options": [
        {{"label": "Keine", "value": "0", "score": 0}},
        {{"label": "Leicht", "value": "1", "score": 1}}
      ]
    }}
  ]
}}
"""
    import json
    text = (await _gemini(prompt)).strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = {"raw_response": text, "parse_error": "Gemini returned non-JSON"}

    return {"parsed_draft": parsed}


# ──────────────────────────────────────────
# Export config per assessment
# ──────────────────────────────────────────

@router.get("/assessments/{assessment_id}/export-config")
async def get_export_config(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    # Merge stored config with defaults so all keys are always present
    config = {**_DEFAULT_EXPORT_CONFIG, **(assessment.export_config or {})}
    return config


@router.patch("/assessments/{assessment_id}/export-config")
async def save_export_config(
    assessment_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assessment.export_config = payload
    await db.commit()
    return {**_DEFAULT_EXPORT_CONFIG, **payload}


# Assessment version management
# ──────────────────────────────────────────

@router.post("/assessments/{assessment_id}/versions")
async def create_version(
    assessment_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save a reviewed/edited assessment draft as a new version.
    payload: { "questions": [...], "changelog": "..." }
    """
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Determine next version number
    version_result = await db.execute(
        select(AssessmentVersion)
        .where(AssessmentVersion.assessment_id == assessment_id)
        .order_by(AssessmentVersion.version_number.desc())
    )
    latest = version_result.scalar_one_or_none()
    next_version = (latest.version_number + 1) if latest else 1

    version = AssessmentVersion(
        assessment_id=assessment_id,
        version_number=next_version,
        changelog=payload.get("changelog", ""),
        is_active=False,
    )
    db.add(version)
    await db.flush()

    # Create questions + options
    for i, q_data in enumerate(payload.get("questions", []), start=1):
        question = Question(
            version_id=version.id,
            position=i,
            key=q_data["key"],
            text=q_data["text"],
            help_text=q_data.get("help_text"),
            question_type=QuestionType(_normalize_type(q_data.get("type", "text"))),
            is_required=q_data.get("is_required", True),
            skip_value=q_data.get("skip_value"),
            meta=q_data.get("meta"),
        )
        db.add(question)
        await db.flush()

        for j, opt in enumerate(q_data.get("options", []), start=1):
            answer_opt = AnswerOption(
                question_id=question.id,
                position=j,
                label=opt["label"],
                value=str(opt["value"]),
                score=opt.get("score"),
            )
            db.add(answer_opt)

    await db.commit()
    return {"version_id": version.id, "version_number": next_version}


@router.patch("/assessments/{assessment_id}/versions/{version_id}/activate")
async def activate_version(
    assessment_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Activate a version (deactivates all others for this assessment)."""
    all_versions_result = await db.execute(
        select(AssessmentVersion).where(AssessmentVersion.assessment_id == assessment_id)
    )
    for v in all_versions_result.scalars().all():
        v.is_active = v.id == version_id

    await db.commit()
    return {"activated": version_id}


@router.get("/assessments/{assessment_id}/versions")
async def list_versions(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all versions of an assessment (newest first) with question counts."""
    versions_result = await db.execute(
        select(AssessmentVersion)
        .where(AssessmentVersion.assessment_id == assessment_id)
        .order_by(AssessmentVersion.version_number.desc())
    )
    versions = versions_result.scalars().all()

    rows = []
    for v in versions:
        count_result = await db.execute(
            select(func.count()).where(Question.version_id == v.id)
        )
        rows.append({
            "id": v.id,
            "version_number": v.version_number,
            "is_active": v.is_active,
            "changelog": v.changelog,
            "created_at": v.created_at,
            "question_count": count_result.scalar() or 0,
        })
    return rows


@router.get("/assessments/{assessment_id}/versions/{version_id}/questions")
async def get_version_questions(
    assessment_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return questions + answer options for a specific version (used for cloning)."""
    questions_result = await db.execute(
        select(Question)
        .where(Question.version_id == version_id)
        .order_by(Question.position)
    )
    questions = questions_result.scalars().all()

    rows = []
    for q in questions:
        opts_result = await db.execute(
            select(AnswerOption)
            .where(AnswerOption.question_id == q.id)
            .order_by(AnswerOption.position)
        )
        rows.append({
            "key": q.key,
            "text": q.text,
            "help_text": q.help_text,
            "type": q.question_type,
            "is_required": q.is_required,
            "skip_value": q.skip_value,
            "meta": q.meta,
            "options": [
                {"label": o.label, "value": o.value, "score": o.score}
                for o in opts_result.scalars().all()
            ],
        })
    return rows


@router.post("/chat")
async def studio_chat(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    AI chat for refining assessment structure.
    payload: { "message": str, "context": { "assessment_id": str } }
    """
    import json
    message = payload.get("message", "")
    assessment_id = payload.get("context", {}).get("assessment_id")

    # Load full assessment structure from DB for context
    assessment_context = {}
    if assessment_id:
        a_result = await db.execute(
            select(Assessment).where(Assessment.id == assessment_id)
        )
        assessment = a_result.scalar_one_or_none()
        if assessment:
            v_result = await db.execute(
                select(AssessmentVersion)
                .where(AssessmentVersion.assessment_id == assessment_id)
                .order_by(AssessmentVersion.version_number.desc())
            )
            version = v_result.scalars().first()
            questions_data = []
            if version:
                q_result = await db.execute(
                    select(Question).where(Question.version_id == version.id).order_by(Question.position)
                )
                for q in q_result.scalars().all():
                    opts_result = await db.execute(
                        select(AnswerOption).where(AnswerOption.question_id == q.id).order_by(AnswerOption.position)
                    )
                    questions_data.append({
                        "key": q.key,
                        "position": q.position,
                        "text": q.text,
                        "help_text": q.help_text,
                        "type": q.question_type.value,  # "scale" not "QuestionType.SCALE"
                        "is_required": q.is_required,
                        "skip_value": q.skip_value,
                        "options": [{"label": o.label, "value": o.value, "score": o.score} for o in opts_result.scalars().all()],
                    })
            assessment_context = {
                "name": assessment.name,
                "abbreviation": assessment.abbreviation,
                "description": assessment.description,
                "scoring_logic": assessment.scoring_logic,
                "questions": questions_data,
            }

    system_prompt = """Du bist ALMA Studio Assistent, ein Experte für psychiatrische Assessments.

Wenn der Benutzer eine strukturelle Änderung am Assessment wünscht (z.B. Items tauschen, hinzufügen, löschen, Text ändern):
- Antworte mit einer kurzen Erklärung UND dem vollständigen aktualisierten JSON-Objekt im Format:
{"questions": [...alle items in der neuen Reihenfolge/Form...]}
- Gib IMMER die vollständige questions-Liste zurück, nicht nur die geänderten Items.
- Halte alle bestehenden Felder (key, text, type, options, is_required, skip_value, help_text) bei.

Bei allgemeinen Fragen ohne Strukturänderung: antworte normal ohne JSON.
Sei präzise und klinisch korrekt."""

    user_content = f"""Aktuelles Assessment:
{json.dumps(assessment_context, ensure_ascii=False, indent=2)}

Benutzeranfrage: {message}"""

    reply = await _gemini(f"{system_prompt}\n\n{user_content}")
    return {"reply": reply, "tokens_used": 0}


# ──────────────────────────────────────────
# API Key Validation
# ──────────────────────────────────────────

@router.get("/validate-api-key")
async def validate_api_key():
    """
    Test whether the configured Anthropic API key is valid by making a minimal
    API call. Returns {"valid": true/false, "provider": "anthropic"}.
    """
    if not settings.anthropic_api_key:
        return {"valid": False, "provider": "anthropic", "detail": "No API key configured"}

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return {"valid": True, "provider": "anthropic"}
    except Exception as exc:
        return {"valid": False, "provider": "anthropic", "detail": str(exc)}


# ──────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────

def _normalize_type(raw: str) -> str:
    """
    Normalize question type strings from AI output.
    Accepts: "scale", "QuestionType.SCALE", "QuestionType.scale", "SCALE"
    Returns: "scale" (the enum value)
    """
    if not raw:
        return "text"
    # Strip "QuestionType." prefix if AI returned full enum repr
    if "." in raw:
        raw = raw.split(".")[-1]
    return raw.lower()


def _extract_pdf_text(content: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(content))
    text_parts = []
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
    return "\n".join(text_parts)


_PARSE_PROMPT = """\
Deine einzige Aufgabe: Extrahiere die Assessment-Struktur aus dem beigefügten PDF-Dokument.

STRIKTE REGELN — halte dich exakt daran:
1. Übernimm Fragetexte, Antwortoptionen und den Assessment-Namen WÖRTLICH aus dem Dokument.
2. Erfinde NICHTS und nutze NICHT dein Allgemeinwissen. Wenn etwas im PDF fehlt, lass das Feld leer.
3. Wenn das PDF kein Assessment/Fragebogen-Dokument ist oder der Inhalt nicht extrahierbar ist,
   antworte ausschließlich mit: {"error": "Kein Assessment-Bogen erkannt"}
4. Antworte NUR mit validem JSON ohne Markdown-Backticks oder sonstige Umrahmung.

Erwartetes JSON-Format:
{
  "name": "Vollständiger offizieller Name des Assessments wie im Dokument",
  "abbreviation": "Offizielle Abkürzung (z.B. HoNOS, PHQ-9, LARS, AES)",
  "description": "Beschreibung/Zweck des Assessments aus dem Dokument",
  "scoring_logic": "sum",
  "questions": [
    {
      "key": "item_1",
      "text": "Exakter Fragetext wie im Dokument",
      "help_text": "Erläuterungstext/Ankerbeispiele falls im Dokument vorhanden",
      "type": "scale",
      "is_required": true,
      "skip_value": null,
      "options": [
        {"label": "Exakte Antwortbeschriftung aus dem Dokument", "value": "0", "score": 0}
      ]
    }
  ]
}

Wichtige Hinweise zu den Feldern:
- "type": nutze "scale" für numerische Bewertungsskalen, "single_select" für Ja/Nein oder kategoriale Optionen
- "skip_value": nur setzen wenn das Dokument explizit einen Skip-Code (z.B. 9 = nicht beurteilbar) definiert
- Gib ALLE Items/Fragen des Assessments zurück, nicht nur einige Beispiele
"""


async def _parse_pdf_with_claude(pdf_bytes: bytes) -> dict:
    """Send PDF directly to Claude — no pypdf text extraction, no hallucination."""
    import json
    import base64
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": base64.standard_b64encode(pdf_bytes).decode("utf-8"),
                        },
                    },
                    {
                        "type": "text",
                        "text": _PARSE_PROMPT,
                    },
                ],
            }
        ],
    )
    text = message.content[0].text.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(text)
    except Exception:
        return {"raw_response": text, "parse_error": "Claude response could not be parsed as JSON"}


async def _parse_pdf_with_gemini_native(pdf_bytes: bytes) -> dict:
    """Send PDF as inline base64 to Gemini — no pypdf, no hallucination."""
    import json
    import base64

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "application/pdf",
                            "data": base64.standard_b64encode(pdf_bytes).decode("utf-8"),
                        }
                    },
                    {"text": _PARSE_PROMPT},
                ]
            }
        ]
    }
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(text)
    except Exception:
        return {"raw_response": text, "parse_error": "Could not parse Gemini response as JSON"}


async def _gemini(prompt: str) -> str:
    """Call Gemini REST API directly."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.gemini_api_key}"
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _parse_with_gemini(pdf_text: str) -> dict:
    import json
    prompt = f"""Du bist ein Experte für psychiatrische Assessment-Bögen.
Analysiere den folgenden Text aus einem Assessment-PDF und extrahiere die Struktur.

PDF-Text:
{pdf_text[:8000]}

Antworte NUR mit gültigem JSON (ohne Markdown-Backticks) im Format:
{{
  "name": "Vollständiger Assessment-Name",
  "abbreviation": "Kürzel z.B. HoNOS",
  "description": "Kurzbeschreibung des Zwecks",
  "scoring_logic": "sum|honos|phq9|custom",
  "questions": [
    {{
      "key": "item_1",
      "text": "Vollständiger Fragetext",
      "help_text": "Optionaler Hilfetext",
      "type": "scale|single_select|multi_select|checkbox|text|number|section",
      "is_required": true,
      "skip_value": 9,
      "options": [
        {{"label": "Keine Beeinträchtigung", "value": "0", "score": 0}}
      ]
    }}
  ]
}}"""

    text = (await _gemini(prompt)).strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(text)
    except Exception:
        return {
            "raw_response": text,
            "parse_error": "Could not parse Gemini response as JSON",
        }


# ──────────────────────────────────────────
# Session Auswertungen (Admin)
# ──────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    tenant_id: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """
    List all completed sessions for a tenant, newest first.
    Includes assessment metadata and export_log.
    """
    result = await db.execute(
        select(AssessmentSession, AssessmentVersion, Assessment)
        .join(AssessmentVersion, AssessmentSession.assessment_version_id == AssessmentVersion.id)
        .join(Assessment, AssessmentVersion.assessment_id == Assessment.id)
        .where(AssessmentSession.tenant_id == tenant_id)
        .order_by(desc(AssessmentSession.started_at))
        .limit(limit)
    )
    rows = []
    for session, version, assessment in result.all():
        score = session.score_result or {}
        rows.append({
            "id": session.id,
            "encounter_id": session.encounter_id,
            "patient_name": session.patient_name,
            "patient_id": session.patient_id,
            "assessment_name": assessment.name,
            "assessment_abbreviation": assessment.abbreviation,
            "assessment_version": version.version_number,
            "status": session.status,
            "started_at": session.started_at,
            "completed_at": session.completed_at,
            "score": {
                "total_score": score.get("total_score"),
                "interpretation": score.get("interpretation", ""),
            },
            "export_log": session.export_log or {},
        })
    return rows


@router.get("/sessions/{session_id}/pdf")
async def get_session_pdf(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Stream the result PDF for a session."""
    result = await db.execute(
        select(AssessmentSession).where(AssessmentSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    export_log = session.export_log or {}
    pdf_info = export_log.get("_pdf") or {}
    pdf_path = pdf_info.get("path")

    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found for this session")

    encounter = session.encounter_id.replace("/", "_")
    filename = f"ALMA_{encounter}_{session_id[:8]}.pdf"
    return FileResponse(pdf_path, media_type="application/pdf", filename=filename)


@router.get("/sessions/{session_id}/hl7/{fmt}")
async def download_session_hl7(
    session_id: str,
    fmt: str,
    db: AsyncSession = Depends(get_db),
):
    """Stream a saved HL7 file (hl7_oru or hl7_mdm) for a session."""
    result = await db.execute(
        select(AssessmentSession).where(AssessmentSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    export_log = session.export_log or {}
    entry = export_log.get(fmt)
    if not entry or not entry.get("file"):
        raise HTTPException(status_code=404, detail=f"Kein {fmt}-Export vorhanden")

    hl7_path = entry["file"]
    if not os.path.exists(hl7_path):
        raise HTTPException(status_code=404, detail="Datei nicht (mehr) auf Disk vorhanden")

    encounter = session.encounter_id.replace("/", "_")
    filename = f"ALMA_{encounter}_{session_id[:8]}_{fmt}.hl7"
    return FileResponse(hl7_path, media_type="text/plain", filename=filename)
