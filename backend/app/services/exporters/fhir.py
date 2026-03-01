"""
FHIR R4 Exporter
─────────────────────────────────────────────────────────────────────────────
Produces a FHIR QuestionnaireResponse resource containing:
  - All individual question responses as items
  - Total score as an extension

Optionally wraps the total score as an Observation resource as well.
─────────────────────────────────────────────────────────────────────────────
"""
from datetime import datetime, timezone
from app.services.exporters.base import BaseExporter, ExportContext


class FHIRExporter(BaseExporter):
    format_name = "FHIR R4"

    async def export(self, context: ExportContext) -> dict:
        now_iso = datetime.now(timezone.utc).isoformat()
        authored = context.completed_at.isoformat()

        items = []
        for key, value in context.responses.items():
            items.append({
                "linkId": key,
                "answer": [{"valueString": str(value)}],
            })

        questionnaire_response = {
            "resourceType": "QuestionnaireResponse",
            "id": context.session_id,
            "status": "completed",
            "authored": authored,
            "subject": {
                "identifier": {
                    "system": "urn:alma:encounter",
                    "value": context.encounter_id,
                }
            },
            "item": items,
            "extension": [
                {
                    "url": "urn:alma:score:total",
                    "valueDecimal": context.score_result.total_score,
                },
                {
                    "url": "urn:alma:score:interpretation",
                    "valueString": context.score_result.interpretation,
                },
            ],
        }

        # Optional patient reference
        if context.patient_id:
            questionnaire_response["subject"]["reference"] = f"Patient/{context.patient_id}"

        # Observation for the total score
        observation = {
            "resourceType": "Observation",
            "id": f"{context.session_id}-score",
            "status": "final",
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "72133-2",   # Mental health assessment scale score (placeholder)
                        "display": f"{context.assessment_abbreviation} Total Score",
                    }
                ]
            },
            "valueQuantity": {
                "value": context.score_result.total_score,
                "unit": "score",
                "system": "http://unitsofmeasure.org",
                "code": "{score}",
            },
            "effectiveDateTime": authored,
            "derivedFrom": [{"reference": f"QuestionnaireResponse/{context.session_id}"}],
        }

        return {
            "format": self.format_name,
            "success": True,
            "payload": {
                "questionnaire_response": questionnaire_response,
                "observation": observation,
            },
        }
