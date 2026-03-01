"""
Assessment models — core of ALMA's dynamic engine.

Hierarchy:
  Assessment (metadata / catalogue entry)
    └── AssessmentVersion (versioned schema)
          └── Question (ordered items)
                └── AnswerOption (for choice-type questions)
"""
from enum import Enum as PyEnum
from sqlalchemy import (
    String, Text, Integer, Boolean, DateTime, ForeignKey, JSON, Enum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class QuestionType(str, PyEnum):
    """All supported input types in the ALMA engine."""
    SCALE = "scale"           # Numeric slider / rating (e.g., 0–4 HoNOS)
    CHECKBOX = "checkbox"     # Single checkbox (yes/no)
    MULTI_SELECT = "multi_select"  # Multiple checkboxes
    SINGLE_SELECT = "single_select"  # Radio / dropdown
    TEXT = "text"             # Free-text input
    NUMBER = "number"         # Numeric input
    DATE = "date"             # Date picker
    SECTION = "section"       # Visual separator, not an input


class AssessmentStatus(str, PyEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Assessment(Base):
    """Top-level catalogue entry — one per assessment type (e.g. HoNOS, PHQ-9)."""
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(30), nullable=False)  # e.g. "HoNOS"
    description: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))  # reference / PDF URL
    scoring_logic: Mapped[str | None] = mapped_column(String(100))  # e.g. "honos", "sum", "phq9"
    status: Mapped[AssessmentStatus] = mapped_column(
        Enum(AssessmentStatus), default=AssessmentStatus.DRAFT
    )
    export_config: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="assessments")
    versions: Mapped[list["AssessmentVersion"]] = relationship(
        back_populates="assessment", order_by="AssessmentVersion.version_number"
    )

    @property
    def current_version(self) -> "AssessmentVersion | None":
        published = [v for v in self.versions if v.is_active]
        return published[-1] if published else None


class AssessmentVersion(Base):
    """Versioned schema — questions belong to a version, not the assessment directly."""
    __tablename__ = "assessment_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    changelog: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    assessment: Mapped["Assessment"] = relationship(back_populates="versions")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="version", order_by="Question.position"
    )

    def __repr__(self) -> str:
        return f"<AssessmentVersion {self.assessment_id} v{self.version_number}>"


class Question(Base):
    """A single question / item within a versioned assessment."""
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessment_versions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)  # machine-readable, e.g. "honos_1"
    text: Mapped[str] = mapped_column(Text, nullable=False)        # displayed question text
    help_text: Mapped[str | None] = mapped_column(Text)
    question_type: Mapped[QuestionType] = mapped_column(Enum(QuestionType), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    skip_value: Mapped[int | None] = mapped_column(Integer)  # e.g. 9 → skip in scoring (HoNOS)
    meta: Mapped[dict | None] = mapped_column(JSON)          # extra config (min/max, unit, etc.)

    # Relationships
    version: Mapped["AssessmentVersion"] = relationship(back_populates="questions")
    answer_options: Mapped[list["AnswerOption"]] = relationship(
        back_populates="question", order_by="AnswerOption.position"
    )


class AnswerOption(Base):
    """Predefined options for SINGLE_SELECT / MULTI_SELECT / SCALE questions."""
    __tablename__ = "answer_options"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    value: Mapped[str] = mapped_column(String(100), nullable=False)  # stored value (often numeric)
    score: Mapped[int | None] = mapped_column(Integer)               # numeric score if applicable

    # Relationships
    question: Mapped["Question"] = relationship(back_populates="answer_options")
