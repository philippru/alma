"""
Base scoring engine — all assessment-specific scorers inherit from this.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ScoringResult:
    """Standardized scoring output, consumed by all exporters."""
    total_score: float
    subscores: dict[str, float] = field(default_factory=dict)
    interpretation: str = ""
    skipped_items: list[str] = field(default_factory=list)   # keys of skipped/9-coded items
    meta: dict = field(default_factory=dict)                  # engine-specific extras

    def to_dict(self) -> dict:
        return {
            "total_score": self.total_score,
            "subscores": self.subscores,
            "interpretation": self.interpretation,
            "skipped_items": self.skipped_items,
            "meta": self.meta,
        }


class BaseScoringEngine(ABC):
    """
    All scoring engines implement this interface.
    Input: dict of {question_key: raw_value_string}
    Output: ScoringResult
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Machine-readable engine name, matches Assessment.scoring_logic."""
        ...

    @abstractmethod
    def score(self, responses: dict[str, str]) -> ScoringResult:
        """Calculate the score from a flat dict of responses."""
        ...

    def _to_int(self, value: str | None, default: int = 0) -> int:
        try:
            return int(value) if value is not None else default
        except (ValueError, TypeError):
            return default
