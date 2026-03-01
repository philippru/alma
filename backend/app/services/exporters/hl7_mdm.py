"""
HL7 v2.x MDM^T02 Exporter
─────────────────────────────────────────────────────────────────────────────
"Medical Document Management" — archives a formatted result document
back into the patient's record (e.g. as a PDF note in Orbis).

Encodes the result summary as Base64 in an OBX segment (ED data type).
─────────────────────────────────────────────────────────────────────────────
"""
import base64
from datetime import datetime, timezone
from app.services.exporters.base import BaseExporter, ExportContext


def _hl7_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y%m%d%H%M%S")


def _build_document_text(context: ExportContext) -> str:
    """Build a human-readable plain-text summary of the assessment result."""
    lines = [
        f"ALMA Assessment Result",
        f"{'=' * 40}",
        f"Assessment:  {context.assessment_name} ({context.assessment_abbreviation}) v{context.assessment_version}",
        f"Encounter:   {context.encounter_id}",
        f"Patient:     {context.patient_name or 'Anonym'}",
        f"Completed:   {context.completed_at.strftime('%d.%m.%Y %H:%M')}",
        f"",
        f"ERGEBNIS",
        f"--------",
        f"Gesamtscore: {context.score_result.total_score}",
        f"Bewertung:   {context.score_result.interpretation}",
        f"",
        f"SUBSCORES",
        f"---------",
    ]
    for subscale, value in context.score_result.subscores.items():
        lines.append(f"  {subscale}: {value}")

    if context.score_result.skipped_items:
        lines.append("")
        lines.append(f"Übersprungen (Code 9): {', '.join(context.score_result.skipped_items)}")

    lines.append("")
    lines.append(f"Erstellt von ALMA | session_id={context.session_id}")

    return "\n".join(lines)


class HL7MDMExporter(BaseExporter):
    format_name = "HL7 v2 MDM"

    async def export(self, context: ExportContext) -> dict:
        now = datetime.now(timezone.utc)
        ts = _hl7_timestamp(now)
        completed_ts = _hl7_timestamp(context.completed_at)

        pid_patient_id = context.patient_id or context.encounter_id
        pid_patient_name = context.patient_name or "UNKNOWN"
        pid_dob = context.patient_dob.replace("-", "") if context.patient_dob else ""

        # Prefer PDF if available, fall back to plain text
        if context.pdf_bytes:
            doc_b64 = base64.b64encode(context.pdf_bytes).decode("ascii")
            obx_mime = "application^PDF^Base64"
            txa_doc_type = "AP"  # Autopsy/Procedure note → PDF archival
        else:
            doc_text = _build_document_text(context)
            doc_b64 = base64.b64encode(doc_text.encode("utf-8")).decode("ascii")
            obx_mime = "TEXT^TXT^Base64"
            txa_doc_type = "TX"

        segments: list[str] = []

        # MSH
        segments.append(
            f"MSH|^~\\&|ALMA|ALMA_STUDIO|KIS|KIS|{ts}||MDM^T02|{context.session_id}_MDM|P|2.5"
        )

        # EVN
        segments.append(f"EVN|T02|{ts}")

        # PID
        segments.append(
            f"PID|1||{pid_patient_id}^^^ALMA||{pid_patient_name}||{pid_dob}"
        )

        # PV1
        segments.append(
            f"PV1|1|I|||||||||||||||{context.encounter_id}"
        )

        # TXA — Transcription Document Header
        segments.append(
            f"TXA|1|{context.assessment_abbreviation}|{txa_doc_type}|{completed_ts}|||||||{context.session_id}||"
            f"AU||AV|{context.assessment_name} v{context.assessment_version}"
        )

        # OBX — Embedded document (PDF or plain text, Base64)
        segments.append(
            f"OBX|1|ED|{context.assessment_abbreviation}_DOC^^ALMA||"
            f"ALMA^{obx_mime}^{doc_b64}|||||F|||{completed_ts}"
        )

        message = "\r".join(segments) + "\r"

        return {
            "format": self.format_name,
            "success": True,
            "payload": {
                "hl7_message": message,
                "encoding": "ER7",
                "has_pdf": context.pdf_bytes is not None,
            },
        }
