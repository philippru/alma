"""
AssessmentSession — one player run (encounter_id + assessment).
Holds patient context from URL parameters.
"""
from enum import Enum as PyEnum
from sqlalchemy import String, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class SessionStatus(str, PyEnum):
    STARTED = "started"
    COMPLETED = "completed"
    EXPORTED = "exported"
    ABANDONED = "abandoned"


class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    assessment_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessment_versions.id"), nullable=False)

    # Patient context — from URL parameters
    encounter_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(255), index=True)   # optional PID
    patient_name: Mapped[str | None] = mapped_column(String(500))              # optional, DSGVO!
    patient_dob: Mapped[str | None] = mapped_column(String(20))               # optional, DSGVO!

    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.STARTED)
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True))

    # Score snapshot (cached after completion)
    score_result: Mapped[dict | None] = mapped_column(JSON)

    # Export log: which exporters ran and their results/file paths
    export_log: Mapped[dict | None] = mapped_column(JSON)

    # Relationships
    tenant: Mapped["Tenant"] = relationship(back_populates="sessions")
    responses: Mapped[list["Response"]] = relationship(back_populates="session")
