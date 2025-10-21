"""
Message model for chat history.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class Message(Base):
    """Chat message model for conversation history."""

    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)

    # Conversation context
    chat_id = Column(String(36), nullable=False, index=True)  # Groups messages in a conversation
    bot_id = Column(String(36), ForeignKey("bots.id"), nullable=False, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), nullable=False, index=True)

    # Message content
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)

    # Message metadata
    tokens_used = Column(Integer, nullable=True)
    model_id = Column(String(255), nullable=True)
    metadata = Column(JSON, default=dict, nullable=True)  # Additional info (stop_reason, etc.)

    # RAG context (if applicable)
    context_used = Column(JSON, default=list, nullable=True)  # List of knowledge chunks used

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="messages")
    bot = relationship("Bot", back_populates="messages")

    def __repr__(self):
        return f"<Message {self.id} ({self.role})>"
