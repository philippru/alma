"""
Assessment CRUD — Studio endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from app.database import get_db
from app.models.assessment import Assessment, AssessmentVersion, Question, AnswerOption, AssessmentStatus
from app.models.session import AssessmentSession

router = APIRouter(prefix="/assessments", tags=["assessments"])


@router.get("/")
async def list_assessments(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
):
    assessments_result = await db.execute(
        select(Assessment).where(Assessment.tenant_id == tenant_id).order_by(desc(Assessment.created_at))
    )
    assessments = assessments_result.scalars().all()
    if not assessments:
        return []

    # Load all versions for these assessments in one query
    ids = [a.id for a in assessments]
    versions_result = await db.execute(
        select(AssessmentVersion).where(AssessmentVersion.assessment_id.in_(ids))
    )
    all_versions = versions_result.scalars().all()

    # Group by assessment_id
    from collections import defaultdict
    versions_by_assessment: dict[str, list] = defaultdict(list)
    for v in all_versions:
        versions_by_assessment[v.assessment_id].append(v)

    rows = []
    for a in assessments:
        versions = versions_by_assessment[a.id]
        active = next((v for v in versions if v.is_active), None)
        rows.append({
            "id": a.id,
            "name": a.name,
            "abbreviation": a.abbreviation,
            "description": a.description,
            "scoring_logic": a.scoring_logic,
            "status": a.status,
            "created_at": a.created_at,
            "version_count": len(versions),
            "active_version_number": active.version_number if active else None,
        })
    return rows


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assessment).where(Assessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    versions_result = await db.execute(
        select(AssessmentVersion)
        .where(AssessmentVersion.assessment_id == assessment_id)
        .order_by(AssessmentVersion.version_number.desc())
    )
    versions = versions_result.scalars().all()
    active = next((v for v in versions if v.is_active), None)

    return {
        "id": assessment.id,
        "tenant_id": assessment.tenant_id,
        "name": assessment.name,
        "abbreviation": assessment.abbreviation,
        "description": assessment.description,
        "source_url": assessment.source_url,
        "scoring_logic": assessment.scoring_logic,
        "status": assessment.status,
        "export_config": assessment.export_config or {},
        "created_at": assessment.created_at,
        "updated_at": assessment.updated_at,
        "version_count": len(versions),
        "active_version_number": active.version_number if active else None,
        "active_version_id": active.id if active else None,
    }


@router.post("/")
async def create_assessment(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    assessment = Assessment(
        tenant_id=payload["tenant_id"],
        name=payload["name"],
        abbreviation=payload["abbreviation"],
        description=payload.get("description"),
        source_url=payload.get("source_url"),
        scoring_logic=payload.get("scoring_logic"),
        status=AssessmentStatus.DRAFT,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return {"id": assessment.id, "status": "created"}


@router.delete("/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Check for existing sessions — refuse deletion if any exist
    versions_result = await db.execute(
        select(AssessmentVersion.id).where(AssessmentVersion.assessment_id == assessment_id)
    )
    version_ids = [r[0] for r in versions_result.all()]

    if version_ids:
        sessions_result = await db.execute(
            select(AssessmentSession.id)
            .where(AssessmentSession.assessment_version_id.in_(version_ids))
            .limit(1)
        )
        if sessions_result.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Assessment hat bereits Auswertungs-Sessions und kann nicht gelöscht werden.",
            )

    # Cascade delete: answer_options → questions → versions → assessment
    if version_ids:
        question_ids_result = await db.execute(
            select(Question.id).where(Question.version_id.in_(version_ids))
        )
        question_ids = [r[0] for r in question_ids_result.all()]
        if question_ids:
            await db.execute(delete(AnswerOption).where(AnswerOption.question_id.in_(question_ids)))
        await db.execute(delete(Question).where(Question.version_id.in_(version_ids)))
        await db.execute(delete(AssessmentVersion).where(AssessmentVersion.assessment_id == assessment_id))

    await db.delete(assessment)
    await db.commit()
    return {"status": "deleted"}


@router.patch("/{assessment_id}/publish")
async def publish_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Ensure at least one version is active — auto-activate the latest if none is
    versions_result = await db.execute(
        select(AssessmentVersion)
        .where(AssessmentVersion.assessment_id == assessment_id)
        .order_by(AssessmentVersion.version_number.desc())
    )
    versions = versions_result.scalars().all()

    if not versions:
        raise HTTPException(
            status_code=422,
            detail="Cannot publish: assessment has no versions yet. Create a version first."
        )

    has_active = any(v.is_active for v in versions)
    if not has_active:
        # Auto-activate the latest version
        versions[0].is_active = True

    assessment.status = AssessmentStatus.PUBLISHED
    await db.commit()

    return {
        "status": "published",
        "active_version": versions[0].version_number if not has_active else next(v.version_number for v in versions if v.is_active),
    }


@router.patch("/{assessment_id}/unpublish")
async def unpublish_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assessment.status = AssessmentStatus.DRAFT
    await db.commit()
    return {"status": "draft"}
