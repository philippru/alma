"""
HoNOS Scoring Engine
─────────────────────────────────────────────────────────────────────────────
Health of the Nation Outcome Scales (HoNOS)
12 items, each rated 0–4 (integer).
Score 9 = "not known / not applicable" → excluded from sum.

Subscales:
  A: Behaviour       items 1–3
  B: Impairment      items 4–5
  C: Symptoms        items 6–8
  D: Social          items 9–12

Total = sum of non-9 items.
─────────────────────────────────────────────────────────────────────────────
"""
from app.services.scoring.base import BaseScoringEngine, ScoringResult

SKIP_VALUE = 9

SUBSCALES = {
    "A_behaviour": ["honos_1", "honos_2", "honos_3"],
    "B_impairment": ["honos_4", "honos_5"],
    "C_symptoms":   ["honos_6", "honos_7", "honos_8"],
    "D_social":     ["honos_9", "honos_10", "honos_11", "honos_12"],
}

ALL_KEYS = [k for keys in SUBSCALES.values() for k in keys]


def _interpret(total: float, n_items: int) -> str:
    if n_items == 0:
        return "Keine auswertbaren Items"
    if total <= 4:
        return "Keine / minimale Beeinträchtigung"
    if total <= 10:
        return "Leichte Beeinträchtigung"
    if total <= 20:
        return "Mittelschwere Beeinträchtigung"
    if total <= 30:
        return "Schwere Beeinträchtigung"
    return "Sehr schwere Beeinträchtigung"


class HoNOSScoringEngine(BaseScoringEngine):
    name = "honos"

    def score(self, responses: dict[str, str]) -> ScoringResult:
        skipped: list[str] = []
        scored_items: list[str] = []
        total = 0.0
        subscores: dict[str, float] = {}

        for subscale, keys in SUBSCALES.items():
            sub_total = 0.0
            for key in keys:
                raw = responses.get(key)
                value = self._to_int(raw, default=SKIP_VALUE)
                if value == SKIP_VALUE or raw is None:
                    skipped.append(key)
                else:
                    sub_total += value
                    scored_items.append(key)
            subscores[subscale] = sub_total
            total += sub_total

        return ScoringResult(
            total_score=total,
            subscores=subscores,
            interpretation=_interpret(total, len(scored_items)),
            skipped_items=skipped,
            meta={
                "n_scored": len(scored_items),
                "n_skipped": len(skipped),
                "max_possible": len(scored_items) * 4,
            },
        )
