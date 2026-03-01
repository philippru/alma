"""
ALMA Integration API — KIS-Schnittstelle (Orbis / generisch)
─────────────────────────────────────────────────────────────
Zwei Endpunkte für die KIS-Integration:

  GET  /integrations/assessments?tenant_id=   → Verfahrenskatalog (alle publizierten)
  POST /integrations/orders                   → Anordnung erstellen → Player-URL

Orbis-Workflow:
  1. Orbis ruft GET /assessments ab → zeigt Auswahlliste der Verfahren
  2. Arzt wählt Verfahren für Fall aus
  3. Orbis ruft POST /orders auf (mit Falldaten) → erhält player_url
  4. player_url wird als iFrame / Worklist-Link in Orbis eingebettet
"""
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.config import get_settings
from app.models.assessment import Assessment, AssessmentVersion, AssessmentStatus, Question

router = APIRouter(prefix="/integrations", tags=["integrations"])
settings = get_settings()


# ── GET /integrations/assessments ─────────────────────────────────────────────

@router.get("/assessments")
async def list_available_assessments(
    tenant_id: str = Query(..., description="Tenant-ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Gibt alle publizierten Assessments zurück, die eine aktive Version haben.
    Dient als Verfahrenskatalog für die KIS-Anordnungsmaske.

    Response-Felder:
      id             → wird für POST /orders.assessment_id verwendet
      abbreviation   → Kurzbezeichnung (z.B. "HoNOS", "PHQ-9")
      name           → Vollständiger Name
      description    → Beschreibung / Indikation
      question_count → Anzahl Fragen in der aktiven Version
    """
    # Nur publizierte Assessments
    result = await db.execute(
        select(Assessment)
        .where(
            Assessment.tenant_id == tenant_id,
            Assessment.status == AssessmentStatus.PUBLISHED,
        )
        .order_by(Assessment.name)
    )
    assessments = result.scalars().all()

    if not assessments:
        return []

    # Aktive Versionen in einem Query laden
    ids = [a.id for a in assessments]
    versions_result = await db.execute(
        select(AssessmentVersion).where(
            AssessmentVersion.assessment_id.in_(ids),
            AssessmentVersion.is_active == True,
        )
    )
    active_versions = {v.assessment_id: v for v in versions_result.scalars().all()}

    # Fragenzahl je aktiver Version laden
    active_version_ids = [v.id for v in active_versions.values()]
    question_counts: dict[str, int] = {}
    if active_version_ids:
        q_result = await db.execute(
            select(Question.version_id)
            .where(Question.version_id.in_(active_version_ids))
        )
        for row in q_result.all():
            question_counts[row[0]] = question_counts.get(row[0], 0) + 1

    rows = []
    for a in assessments:
        av = active_versions.get(a.id)
        if not av:
            # Publiziert aber keine aktive Version — überspringen
            continue
        rows.append({
            "id": a.id,
            "abbreviation": a.abbreviation,
            "name": a.name,
            "description": a.description or "",
            "version_number": av.version_number,
            "question_count": question_counts.get(av.id, 0),
        })

    return rows


# ── POST /integrations/orders ──────────────────────────────────────────────────

@router.post("/orders")
async def create_order(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Erstellt eine Assessment-Anordnung für einen Orbis-Fall.

    Request-Body:
      tenant_id      (Pflicht)  Tenant-ID
      assessment_id  (Pflicht)  ID des gewählten Verfahrens
      encounter_id   (Pflicht)  Fallnummer / Encounter-ID aus dem KIS
      patient_id     (Optional) Patienten-ID / PID
      patient_name   (Optional) Patientenname (für PDF-Deckblatt)
      patient_dob    (Optional) Geburtsdatum (für PDF-Deckblatt), Format: YYYY-MM-DD

    Response:
      assessment_id          Echo
      assessment_name        Name des Verfahrens
      assessment_abbreviation Kürzel
      encounter_id           Echo
      player_url             Vollständige URL → in Orbis als iFrame / Link einbetten
      ordered_at             ISO-Timestamp der Anordnungserstellung
    """
    # Pflichtfelder prüfen
    missing = [f for f in ("tenant_id", "assessment_id", "encounter_id") if not payload.get(f)]
    if missing:
        raise HTTPException(status_code=422, detail=f"Fehlende Pflichtfelder: {', '.join(missing)}")

    tenant_id     = payload["tenant_id"]
    assessment_id = payload["assessment_id"]
    encounter_id  = payload["encounter_id"]
    patient_id    = payload.get("patient_id") or ""
    patient_name  = payload.get("patient_name") or ""
    patient_dob   = payload.get("patient_dob") or ""

    # Assessment laden + prüfen
    result = await db.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment nicht gefunden.")
    if assessment.status != AssessmentStatus.PUBLISHED:
        raise HTTPException(
            status_code=409,
            detail=f"Assessment '{assessment.abbreviation}' ist nicht publiziert und kann nicht angeordnet werden.",
        )

    # Aktive Version prüfen
    version_result = await db.execute(
        select(AssessmentVersion).where(
            AssessmentVersion.assessment_id == assessment_id,
            AssessmentVersion.is_active == True,
        )
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(
            status_code=409,
            detail="Assessment hat keine aktive Version — bitte im Studio aktivieren.",
        )

    # Player-URL aufbauen
    base_url = settings.alma_public_url.rstrip("/")
    params: dict[str, str] = {
        "encounter_id": encounter_id,
        "tenant_id": tenant_id,
    }
    if patient_id:
        params["patient_id"] = patient_id
    if patient_name:
        params["patient_name"] = patient_name
    if patient_dob:
        params["patient_dob"] = patient_dob

    player_url = f"{base_url}/player/run/{assessment_id}?{urlencode(params)}"

    return {
        "assessment_id": assessment_id,
        "assessment_name": assessment.name,
        "assessment_abbreviation": assessment.abbreviation,
        "assessment_version": version.version_number,
        "encounter_id": encounter_id,
        "player_url": player_url,
        "ordered_at": datetime.now(timezone.utc).isoformat(),
    }
