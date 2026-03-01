"""
Base exporter — every "Bein" (leg) implements this interface.

ExportContext bundles everything an exporter needs:
  - Session / patient context
  - Scoring result
  - Raw responses
  - Assessment metadata
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from app.services.scoring.base import ScoringResult


@dataclass
class ExportContext:
    """All data needed to produce any export format."""
    # Patient / encounter
    tenant_id: str
    encounter_id: str
    patient_id: str | None
    patient_name: str | None
    patient_dob: str | None         # ISO date string YYYY-MM-DD

    # Assessment
    assessment_name: str
    assessment_abbreviation: str    # e.g. "HoNOS"
    assessment_version: int
    session_id: str
    completed_at: datetime

    # Results
    score_result: ScoringResult
    responses: dict[str, str]       # {question_key: raw_value}

    # Enriched question list (set by player before calling exporters)
    # Each entry: {key, text, position, value (raw str), score (int|None)}
    questions: list[dict] = field(default_factory=list)

    # Generated PDF bytes (set by player, consumed by MDM exporter)
    pdf_bytes: bytes | None = field(default=None)

    # Extras
    meta: dict = field(default_factory=dict)


class BaseExporter(ABC):
    """Interface every exporter must implement."""

    @property
    @abstractmethod
    def format_name(self) -> str:
        """Human-readable format name, e.g. 'FHIR R4', 'HL7 ORU', 'HL7 MDM'."""
        ...

    @abstractmethod
    async def export(self, context: ExportContext) -> dict:
        """
        Produce the export artifact.
        Returns a dict with at minimum:
          { "format": str, "payload": Any, "success": bool }
        """
        ...
