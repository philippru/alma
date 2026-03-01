"""
ALMA PDF Renderer
─────────────────────────────────────────────────────────────────────────────
Generates a clinical assessment result PDF from an ExportContext.
Used by the MDM exporter (embedded as Base64) and saved to disk for download.
─────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations
import io
import unicodedata
from fpdf import FPDF


def _safe(text: str) -> str:
    """Drop/replace characters outside Latin-1 so Helvetica doesn't crash.
    NFC keeps composed characters (ü, ä, ö ...) intact; only truly
    unsupported code-points (em-dash, box-drawing, etc.) become '?'.
    """
    return unicodedata.normalize("NFC", str(text)).encode("latin-1", errors="replace").decode("latin-1")

# Lazy import to avoid circular dependency at module load time
TYPE_CHECKING = False
if TYPE_CHECKING:
    from app.services.exporters.base import ExportContext

# ── Layout constants ───────────────────────────────────────────────────────────
_MARGIN = 15
_PAGE_W = 210  # A4
_COL_POS = 15
_COL_TEXT = 95
_COL_VAL = 20
_COL_SCORE = 20

_ALMA_BLUE = (41, 98, 195)   # #2962C3 — primary brand colour (approximate)
_LIGHT_GRAY = (245, 245, 245)
_BORDER_GRAY = (220, 220, 220)


class _PDF(FPDF):
    def header(self):
        # Top bar
        self.set_fill_color(*_ALMA_BLUE)
        self.rect(0, 0, 210, 12, "F")
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(255, 255, 255)
        self.set_xy(0, 2)
        self.cell(0, 8, "ALMA - Klinisches Assessment-Ergebnis", align="C")
        self.set_text_color(0, 0, 0)
        # Reset cursor to top margin so content starts below the header bar
        self.set_y(self.t_margin)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 5, f"Erstellt von ALMA | Seite {self.page_no()}", align="C")
        self.set_text_color(0, 0, 0)


def _section_title(pdf: _PDF, title: str) -> None:
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*_LIGHT_GRAY)
    pdf.set_draw_color(*_BORDER_GRAY)
    pdf.cell(0, 6, f"  {title.upper()}", border="B", fill=True, ln=True)
    pdf.ln(2)


def _kv(pdf: _PDF, label: str, value: str) -> None:
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(55, 5, label, ln=False)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, _safe(value), ln=True)


def generate_session_pdf(context: "ExportContext") -> bytes:
    """Render a clinical result PDF and return the raw bytes."""
    pdf = _PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(_MARGIN, 22, _MARGIN)
    pdf.add_page()

    # ── Assessment + Patient info ──────────────────────────────────────────────
    _section_title(pdf, "Assessment & Fall")
    _kv(pdf, "Assessment:", f"{context.assessment_name} ({context.assessment_abbreviation}) v{context.assessment_version}")
    _kv(pdf, "Encounter-ID:", context.encounter_id)
    if context.patient_name:
        _kv(pdf, "Patient:", context.patient_name)
    if context.patient_id:
        _kv(pdf, "Patienten-ID:", context.patient_id)
    if context.patient_dob:
        _kv(pdf, "Geburtsdatum:", context.patient_dob)
    _kv(pdf, "Abgeschlossen:", context.completed_at.strftime("%d.%m.%Y %H:%M UTC"))
    pdf.ln(4)

    # ── Score ──────────────────────────────────────────────────────────────────
    _section_title(pdf, "Ergebnis")
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*_ALMA_BLUE)
    score_str = str(int(context.score_result.total_score)) if context.score_result.total_score == int(context.score_result.total_score) else f"{context.score_result.total_score:.1f}"
    pdf.cell(0, 12, f"Gesamtscore: {score_str} Punkte", ln=True)
    pdf.set_text_color(0, 0, 0)
    if context.score_result.interpretation:
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, _safe(context.score_result.interpretation))
    pdf.ln(3)

    # ── Subscores ─────────────────────────────────────────────────────────────
    if context.score_result.subscores:
        _section_title(pdf, "Subscores")
        for name, val in context.score_result.subscores.items():
            pdf.set_font("Helvetica", "", 9)
            val_str = str(int(val)) if val == int(val) else f"{val:.1f}"
            pdf.set_text_color(80, 80, 80)
            pdf.cell(70, 5, _safe(f"  {name}:"), ln=False)
            pdf.set_text_color(0, 0, 0)
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 5, val_str, ln=True)
        pdf.ln(4)

    # ── Items table ───────────────────────────────────────────────────────────
    if context.questions:
        _section_title(pdf, "Einzelitems")

        # Table header
        effective_width = _PAGE_W - 2 * _MARGIN
        col_pos = 12
        col_text = effective_width - col_pos - 28 - 22  # remainder
        col_val = 28
        col_score = 22

        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*_LIGHT_GRAY)
        pdf.set_draw_color(*_BORDER_GRAY)
        pdf.cell(col_pos, 6, "#", border=1, fill=True)
        pdf.cell(col_text, 6, "Frage", border=1, fill=True)
        pdf.cell(col_val, 6, "Antwort", border=1, fill=True, align="C")
        pdf.cell(col_score, 6, "Punkte", border=1, fill=True, align="C", ln=True)

        skipped = set(context.score_result.skipped_items)
        for q in context.questions:
            text = q.get("text", "")
            # Truncate long questions for table display
            if len(text) > 90:
                text = text[:87] + "..."
            value = q.get("value", "-")
            score = q.get("score")
            pos = str(q.get("position", ""))
            is_skipped = q.get("key") in skipped

            pdf.set_font("Helvetica", "I" if is_skipped else "", 8)
            pdf.set_text_color(160, 160, 160) if is_skipped else pdf.set_text_color(0, 0, 0)

            score_str = str(score) if score is not None else "-"
            if is_skipped:
                score_str = "9 (übersp.)"

            row_h = 5
            # Use multi_cell for text but simulate row manually
            x_start = pdf.get_x()
            y_start = pdf.get_y()

            pdf.cell(col_pos, row_h, _safe(pos), border=1)
            pdf.cell(col_text, row_h, _safe(text), border=1)
            pdf.cell(col_val, row_h, _safe(str(value)), border=1, align="C")
            pdf.cell(col_score, row_h, _safe(score_str), border=1, align="C", ln=True)

        pdf.set_text_color(0, 0, 0)
        pdf.ln(4)

    # ── Footer info ───────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(150, 150, 150)
    pdf.multi_cell(0, 4, f"Session-ID: {context.session_id}")

    # Output to bytes
    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()
