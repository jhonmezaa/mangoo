"""
User model representing registered users from Cognito.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    """User model with Cognito integration."""

    __tablename__ = "users"

    # Primary key is Cognito sub (UUID)
    id = Column(String(255), primary_key=True, index=True)

    # User information
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)

    # Role and permissions
    role = Column(String(50), default="user", nullable=False)  # user, admin
    is_active = Column(Boolean, default=True, nullable=False)

    # Metadata
    metadata = Column(JSON, default=dict, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    bots = relationship("Bot", back_populates="owner", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.username} ({self.email})>"
