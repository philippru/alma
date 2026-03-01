"""
Generic summation scoring engine.
Used for PHQ-9, GAD-7, SAS, and any assessment with scoring_logic "sum".
Sums all numeric responses, skips non-numeric values.
"""
from app.services.scoring.base import BaseScoringEngine, ScoringResult


class SumScoringEngine(BaseScoringEngine):
    name = "sum"

    def score(self, responses: dict[str, str]) -> ScoringResult:
        total = 0.0
        skipped: list[str] = []

        for key, value in responses.items():
            try:
                total += float(value)
            except (ValueError, TypeError):
                skipped.append(key)

        return ScoringResult(
            total_score=total,
            subscores={},
            interpretation=f"Gesamtscore: {int(total)}",
            skipped_items=skipped,
            meta={"n_scored": len(responses) - len(skipped), "n_skipped": len(skipped)},
        )
