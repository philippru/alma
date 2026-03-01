"""
ALMA Player API
─────────────────────────────────────────────────────────────────────────────
Called by the iFrame player. Minimal, fast, stateless-friendly.

URL pattern (as agreed):
  GET  /player/session/init?assessment_id=&encounter_id=&patient_id=&tenant_id=
  POST /player/session/{session_id}/respond   — save a batch of responses
  POST /player/session/{session_id}/complete  — finalize, score, export
─────────────────────────────────────────────────────────────────────────────
"""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.config import get_settings
from app.models.assessment import Assessment, AssessmentVersion, Question, AnswerOption
from app.models.session import AssessmentSession, SessionStatus
from app.models.response import Response
from app.services.scoring import get_scoring_engine
from app.services.exporters import FHIRExporter, HL7ORUExporter, HL7MDMExporter, ExportContext
from app.services.pdf_renderer import generate_session_pdf

settings = get_settings()

# Exporters that write files to disk (picked up by cron)
_FILE_EXPORTERS = {"hl7_oru", "hl7_mdm"}

router = APIRouter(prefix="/player", tags=["player"])


@router.get("/session/init")
async def init_session(
    assessment_id: str = Query(...),
    encounter_id: str = Query(...),
    tenant_id: str = Query(...),
    patient_id: str | None = Query(default=None),
    patient_name: str | None = Query(default=None),
    patient_dob: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Initialize a new player session.
    Returns session_id + the full question schema for rendering.
    """
    # Load the published assessment version
    result = await db.execute(
        select(Assessment).where(Assessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Get active version
    version_result = await db.execute(
        select(AssessmentVersion)
        .where(
            AssessmentVersion.assessment_id == assessment_id,
            AssessmentVersion.is_active == True,
        )
        .order_by(AssessmentVersion.version_number.desc())
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=400, detail="No active version for this assessment")

    # Load questions + options
    questions_result = await db.execute(
        select(Question)
        .where(Question.version_id == version.id)
        .order_by(Question.position)
    )
    questions = questions_result.scalars().all()

    # Build schema for player renderer
    question_schema = []
    for q in questions:
        opts_result = await db.execute(
            select(AnswerOption).where(AnswerOption.question_id == q.id).order_by(AnswerOption.position)
        )
        opts = opts_result.scalars().all()
        question_schema.append({
            "id": q.id,
            "key": q.key,
            "position": q.position,
            "text": q.text,
            "help_text": q.help_text,
            "type": q.question_type,
            "is_required": q.is_required,
            "skip_value": q.skip_value,
            "meta": q.meta or {},
            "options": [
                {"id": o.id, "label": o.label, "value": o.value, "score": o.score, "position": o.position}
                for o in opts
            ],
        })

    # Create session
    session = AssessmentSession(
        tenant_id=tenant_id,
        assessment_version_id=version.id,
        encounter_id=encounter_id,
        patient_id=patient_id,
        patient_name=patient_name,
        patient_dob=patient_dob,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "assessment": {
            "id": assessment.id,
            "name": assessment.name,
            "abbreviation": assessment.abbreviation,
            "version": version.version_number,
        },
        "questions": question_schema,
    }


@router.post("/session/{session_id}/respond")
async def save_responses(
    session_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Save a batch of responses.
    payload: { "responses": [{ "question_id": str, "question_key": str, "value": str }] }
    """
    result = await db.execute(select(AssessmentSession).where(AssessmentSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.STARTED:
        raise HTTPException(status_code=400, detail="Session is not in STARTED state")

    for item in payload.get("responses", []):
        response = Response(
            session_id=session_id,
            question_id=item["question_id"],
            question_key=item["question_key"],
            value=str(item.get("value", "")),
        )
        db.add(response)

    await db.commit()
    return {"status": "saved", "count": len(payload.get("responses", []))}


@router.post("/session/{session_id}/complete")
async def complete_session(
    session_id: str,
    export_formats: list[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Finalize session: score + export.
    export_formats: ["fhir", "hl7_oru", "hl7_mdm"] — optional subset
    """
    result = await db.execute(
        select(AssessmentSession).where(AssessmentSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load responses
    resp_result = await db.execute(
        select(Response).where(Response.session_id == session_id)
    )
    responses = {r.question_key: r.value for r in resp_result.scalars().all()}

    # Load assessment metadata
    version_result = await db.execute(
        select(AssessmentVersion).where(AssessmentVersion.id == session.assessment_version_id)
    )
    version = version_result.scalar_one_or_none()

    assessment_result = await db.execute(
        select(Assessment).where(Assessment.id == version.assessment_id)
    )
    assessment = assessment_result.scalar_one_or_none()

    # Score
    engine = get_scoring_engine(assessment.scoring_logic or "")
    if not engine:
        raise HTTPException(
            status_code=422,
            detail=f"No scoring engine for logic '{assessment.scoring_logic}'"
        )

    score_result = engine.score(responses)

    # Update session
    session.status = SessionStatus.COMPLETED
    session.completed_at = datetime.now(timezone.utc)
    session.score_result = score_result.to_dict()
    await db.commit()

    # Load questions for this version + build enriched list for PDF / context
    questions_result = await db.execute(
        select(Question).where(Question.version_id == version.id).order_by(Question.position)
    )
    all_questions = questions_result.scalars().all()

    # For each question, find the matching AnswerOption to get its score
    question_ids = [q.id for q in all_questions]
    opts_result = await db.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(question_ids))
    )
    opts_by_question: dict[str, dict[str, int | None]] = {}
    for opt in opts_result.scalars().all():
        opts_by_question.setdefault(opt.question_id, {})[opt.value] = opt.score

    enriched_questions = []
    for q in all_questions:
        raw_value = responses.get(q.key)
        score_for_value = None
        if raw_value is not None and q.id in opts_by_question:
            score_for_value = opts_by_question[q.id].get(raw_value)
        enriched_questions.append({
            "key": q.key,
            "text": q.text,
            "position": q.position,
            "value": raw_value or "—",
            "score": score_for_value,
        })

    # Build export context
    context = ExportContext(
        tenant_id=session.tenant_id,
        encounter_id=session.encounter_id,
        patient_id=session.patient_id,
        patient_name=session.patient_name,
        patient_dob=session.patient_dob,
        assessment_name=assessment.name,
        assessment_abbreviation=assessment.abbreviation,
        assessment_version=version.version_number,
        session_id=session_id,
        completed_at=session.completed_at,
        score_result=score_result,
        responses=responses,
        questions=enriched_questions,
    )

    # Generate PDF and save to disk
    pdf_bytes = generate_session_pdf(context)
    pdf_dir = os.path.join(settings.export_dir, session.tenant_id, "pdf")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_filename = f"{session.encounter_id}_{session_id[:8]}.pdf"
    pdf_path = os.path.join(pdf_dir, pdf_filename)
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    context.pdf_bytes = pdf_bytes

    # Determine which exporters are enabled via assessment.export_config
    export_config = assessment.export_config or {}
    all_exporters = {
        "fhir": FHIRExporter(),
        "hl7_oru": HL7ORUExporter(),
        "hl7_mdm": HL7MDMExporter(),
    }
    enabled_keys = [k for k, v in export_config.items() if isinstance(v, dict) and v.get("enabled")]

    export_results = {}
    for fmt in enabled_keys:
        if fmt not in all_exporters:
            continue
        result = await all_exporters[fmt].export(context)

        if fmt in _FILE_EXPORTERS and result.get("success"):
            payload = result["payload"]
            hl7_text = payload["hl7_message"] if isinstance(payload, dict) else str(payload)
            out_dir = os.path.join(settings.export_dir, session.tenant_id, fmt)
            os.makedirs(out_dir, exist_ok=True)
            filename = f"{session.encounter_id}_{session_id[:8]}.hl7"
            file_path = os.path.join(out_dir, filename)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(hl7_text)
            export_results[fmt] = {
                "success": True,
                "file": file_path,
                "format": result.get("format"),
                **({"pdf": pdf_path} if fmt == "hl7_mdm" else {}),
            }
        else:
            export_results[fmt] = result

    # Always record the PDF path in export_log
    export_results["_pdf"] = {"path": pdf_path, "success": True}

    # Persist export log to session
    session.export_log = export_results
    await db.commit()

    return {
        "session_id": session_id,
        "score": score_result.to_dict(),
        "exports": {k: v for k, v in export_results.items() if not k.startswith("_")},
        "pdf_path": pdf_path,
    }
