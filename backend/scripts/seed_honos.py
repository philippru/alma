"""
Seed script — creates a default tenant + HoNOS assessment with all 12 items.

Run inside the backend container:
  docker compose exec backend python scripts/seed_honos.py
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import get_settings
from app.models.tenant import Tenant
from app.models.assessment import (
    Assessment, AssessmentVersion, Question, AnswerOption,
    AssessmentStatus, QuestionType
)

settings = get_settings()

HONOS_ITEMS = [
    (1, "honos_1", "Verhaltens-bedingte psychische und soziale Probleme",
     "Aggressives, zerstörerisches oder unruhiges Verhalten"),
    (2, "honos_2", "Probleme durch absichtliche Selbstverletzung",
     "Suizidversuche, Selbstverletzungen"),
    (3, "honos_3", "Probleme durch Alkohol- oder Drogenkonsum",
     "Missbrauch von Alkohol oder anderen Substanzen"),
    (4, "honos_4", "Kognitive Probleme",
     "Gedächtnisdefizite, Orientierungsprobleme"),
    (5, "honos_5", "Körperliche Erkrankung oder körperliches Handicap",
     "Körperliche Gesundheitsprobleme"),
    (6, "honos_6", "Probleme mit Halluzinationen und Wahngedanken",
     "Psychotische Symptome"),
    (7, "honos_7", "Probleme mit depressiver Stimmung",
     "Depressive Verstimmung"),
    (8, "honos_8", "Andere psychische und Verhaltensprobleme",
     "Angst, Zwänge, Essstörungen etc."),
    (9, "honos_9", "Probleme mit sozialen und unterstützenden Beziehungen",
     "Beziehungsprobleme"),
    (10, "honos_10", "Probleme mit Alltagsaktivitäten",
     "Selbstversorgung, Haushalt"),
    (11, "honos_11", "Probleme mit Wohn- und Lebensbedingungen",
     "Wohnsituation, häusliche Umgebung"),
    (12, "honos_12", "Probleme mit Beschäftigung und Tagesstruktur",
     "Arbeit, Ausbildung, Freizeitaktivitäten"),
]

SCALE_OPTIONS = [
    ("0 — Kein Problem", "0", 0),
    ("1 — Leichtes Problem, keine Intervention nötig", "1", 1),
    ("2 — Leichtes bis mäßiges Problem", "2", 2),
    ("3 — Mäßiges bis schweres Problem", "3", 3),
    ("4 — Schweres bis sehr schweres Problem", "4", 4),
    ("9 — Nicht bekannt / nicht anwendbar", "9", None),
]


async def seed():
    engine = create_async_engine(settings.database_url, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        # Create demo tenant
        tenant = Tenant(name="Demo Klinik", slug="demo")
        db.add(tenant)
        await db.flush()

        # Create HoNOS assessment
        assessment = Assessment(
            tenant_id=tenant.id,
            name="Health of the Nation Outcome Scales",
            abbreviation="HoNOS",
            description="Fremdbeurteilungsskala zur Messung psychosozialer Gesundheit (12 Items, Skala 0–4).",
            scoring_logic="honos",
            status=AssessmentStatus.PUBLISHED,
        )
        db.add(assessment)
        await db.flush()

        # Create version 1
        version = AssessmentVersion(
            assessment_id=assessment.id,
            version_number=1,
            changelog="Initial seed",
            is_active=True,
        )
        db.add(version)
        await db.flush()

        # Create questions + options
        for pos, key, text, help_text in HONOS_ITEMS:
            question = Question(
                version_id=version.id,
                position=pos,
                key=key,
                text=f"Item {pos}: {text}",
                help_text=help_text,
                question_type=QuestionType.SCALE,
                is_required=True,
                skip_value=9,
            )
            db.add(question)
            await db.flush()

            for j, (label, value, score) in enumerate(SCALE_OPTIONS, start=1):
                opt = AnswerOption(
                    question_id=question.id,
                    position=j,
                    label=label,
                    value=value,
                    score=score,
                )
                db.add(opt)

        await db.commit()
        print(f"✓ Tenant:     {tenant.name} (id={tenant.id})")
        print(f"✓ Assessment: {assessment.name} (id={assessment.id})")
        print(f"✓ Version:    v{version.version_number} (id={version.id})")
        print(f"\nPlayer URL:")
        print(f"  /player/run/{assessment.id}?encounter_id=TEST-001&tenant_id={tenant.id}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
