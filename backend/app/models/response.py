"""
Response — individual question answer within a session.
"""
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessment_sessions.id"), nullable=False)
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), nullable=False)
    question_key: Mapped[str] = mapped_column(String(100), nullable=False)  # denormalized for easy export
    value: Mapped[str | None] = mapped_column(Text)   # raw stored value (string representation)
    answered_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session: Mapped["AssessmentSession"] = relationship(back_populates="responses")
