"""
HL7 v2.x ORU^R01 Exporter
─────────────────────────────────────────────────────────────────────────────
Sends numeric result values to a KIS lab/result system (e.g. Orbis).
The total score is transmitted as an OBX segment (numeric observation).
Each subscore becomes an additional OBX.
─────────────────────────────────────────────────────────────────────────────
"""
from datetime import datetime, timezone
from app.services.exporters.base import BaseExporter, ExportContext


def _hl7_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y%m%d%H%M%S")


class HL7ORUExporter(BaseExporter):
    format_name = "HL7 v2 ORU"

    async def export(self, context: ExportContext) -> dict:
        now = datetime.now(timezone.utc)
        ts = _hl7_timestamp(now)
        completed_ts = _hl7_timestamp(context.completed_at)

        pid_patient_id = context.patient_id or context.encounter_id
        pid_patient_name = context.patient_name or "UNKNOWN"
        pid_dob = context.patient_dob.replace("-", "") if context.patient_dob else ""

        segments: list[str] = []

        # MSH — Message Header
        segments.append(
            f"MSH|^~\\&|ALMA|ALMA_STUDIO|KIS|KIS|{ts}||ORU^R01|{context.session_id}|P|2.5"
        )

        # PID — Patient Identification
        segments.append(
            f"PID|1||{pid_patient_id}^^^ALMA||{pid_patient_name}||{pid_dob}|||||||||||{context.encounter_id}"
        )

        # PV1 — Patient Visit (minimal)
        segments.append(
            f"PV1|1|I|||||||||||||||{context.encounter_id}"
        )

        # OBR — Observation Request
        segments.append(
            f"OBR|1||{context.session_id}|{context.assessment_abbreviation}^^^ALMA||"
            f"{completed_ts}|{completed_ts}||||||||||||||F"
        )

        obx_seq = 1

        # OBX — Total Score
        segments.append(
            f"OBX|{obx_seq}|NM|{context.assessment_abbreviation}_TOTAL^^ALMA||"
            f"{context.score_result.total_score}|score|||||F|||{completed_ts}"
        )
        obx_seq += 1

        # OBX — Interpretation
        segments.append(
            f"OBX|{obx_seq}|ST|{context.assessment_abbreviation}_INTERPRETATION^^ALMA||"
            f"{context.score_result.interpretation}|||||F|||{completed_ts}"
        )
        obx_seq += 1

        # OBX — Subscores
        for subscale, value in context.score_result.subscores.items():
            segments.append(
                f"OBX|{obx_seq}|NM|{context.assessment_abbreviation}_{subscale.upper()}^^ALMA||"
                f"{value}|score|||||F|||{completed_ts}"
            )
            obx_seq += 1

        message = "\r".join(segments) + "\r"

        return {
            "format": self.format_name,
            "success": True,
            "payload": {
                "hl7_message": message,
                "encoding": "ER7",
            },
        }
