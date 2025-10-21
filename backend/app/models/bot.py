"""
Bot model representing AI assistants/agents.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Text, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class Bot(Base):
    """Bot/Agent model with configuration and instructions."""

    __tablename__ = "bots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)

    # Bot information
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)  # System prompt

    # Model configuration
    model_id = Column(String(255), nullable=False)
    temperature = Column(Integer, default=70, nullable=False)  # 0-100
    max_tokens = Column(Integer, default=4096, nullable=False)

    # Features
    rag_enabled = Column(Boolean, default=False, nullable=False)
    knowledge_base_id = Column(String(36), nullable=True)  # Reference to knowledge collection

    # Access control
    owner_id = Column(String(255), ForeignKey("users.id"), nullable=False, index=True)
    is_public = Column(Boolean, default=False, nullable=False)
    is_marketplace = Column(Boolean, default=False, nullable=False)  # Available in marketplace

    # Metadata
    metadata = Column(JSON, default=dict, nullable=True)
    tags = Column(JSON, default=list, nullable=True)  # ["customer-service", "sap", etc.]

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="bots")
    messages = relationship("Message", back_populates="bot", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Bot {self.name} (model={self.model_id})>"
