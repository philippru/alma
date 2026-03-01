"""
Scoring engine registry.
Add new engines here — they are resolved by Assessment.scoring_logic.
"""
from app.services.scoring.base import BaseScoringEngine
from app.services.scoring.honos import HoNOSScoringEngine
from app.services.scoring.sum import SumScoringEngine

_sum = SumScoringEngine()

SCORING_REGISTRY: dict[str, BaseScoringEngine] = {
    "honos": HoNOSScoringEngine(),
    "sum":   _sum,
    "phq9":  _sum,
    "gad7":  _sum,
    "custom": _sum,
}


def get_scoring_engine(logic_key: str) -> BaseScoringEngine | None:
    """Return the engine for a given scoring_logic key, or None."""
    return SCORING_REGISTRY.get(logic_key)
