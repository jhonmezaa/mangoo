"""
Agent model for specialized marketplace agents.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Text, Integer
from app.core.database import Base
import uuid


class Agent(Base):
    """Specialized agent model for marketplace."""

    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)

    # Agent information
    name = Column(String(255), nullable=False, unique=True, index=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=False, index=True)  # sap, aws, azure, general

    # Agent type and configuration
    agent_type = Column(String(50), nullable=False)  # conversational, task-executor, data-analyzer
    capabilities = Column(JSON, default=list, nullable=True)  # List of capabilities
    config = Column(JSON, default=dict, nullable=True)  # Agent-specific configuration

    # Deployment
    ecs_service_name = Column(String(255), nullable=True)  # ECS service if deployed separately
    endpoint_url = Column(String(500), nullable=True)  # Internal endpoint

    # Status and availability
    status = Column(String(50), default="active", nullable=False)  # active, inactive, maintenance
    is_public = Column(Boolean, default=True, nullable=False)
    requires_auth = Column(Boolean, default=True, nullable=False)

    # Pricing (future)
    pricing_model = Column(String(50), default="free", nullable=True)  # free, pay-per-use, subscription
    price_per_request = Column(Integer, default=0, nullable=True)  # In cents

    # Metadata
    icon_url = Column(String(500), nullable=True)
    documentation_url = Column(String(500), nullable=True)
    tags = Column(JSON, default=list, nullable=True)
    metadata = Column(JSON, default=dict, nullable=True)

    # Usage stats
    total_requests = Column(Integer, default=0, nullable=False)
    success_rate = Column(Integer, default=100, nullable=False)  # Percentage

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Agent {self.name} ({self.category})>"
