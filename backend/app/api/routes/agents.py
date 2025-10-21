"""
Marketplace agents endpoints.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.middleware.auth import get_current_user_id, require_admin
from app.models.agent import Agent

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentResponse(BaseModel):
    """Agent response schema."""
    id: str
    name: str
    display_name: str
    description: str
    category: str
    agent_type: str
    capabilities: Optional[List[str]]
    status: str
    is_public: bool
    icon_url: Optional[str]
    tags: Optional[List[str]]
    total_requests: int
    success_rate: int

    class Config:
        from_attributes = True


class AgentCreate(BaseModel):
    """Agent creation schema (admin only)."""
    name: str
    display_name: str
    description: str
    category: str
    agent_type: str
    capabilities: Optional[List[str]] = None
    config: Optional[dict] = None
    is_public: bool = True
    icon_url: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """
    List available marketplace agents.

    Filter by category if provided.
    """
    query = select(Agent).where(Agent.is_public == True).where(Agent.status == "active")

    if category:
        query = query.where(Agent.category == category)

    result = await db.execute(query.order_by(Agent.display_name))
    agents = result.scalars().all()

    return [
        AgentResponse(
            id=agent.id,
            name=agent.name,
            display_name=agent.display_name,
            description=agent.description,
            category=agent.category,
            agent_type=agent.agent_type,
            capabilities=agent.capabilities,
            status=agent.status,
            is_public=agent.is_public,
            icon_url=agent.icon_url,
            tags=agent.tags,
            total_requests=agent.total_requests,
            success_rate=agent.success_rate
        )
        for agent in agents
    ]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get details of a specific agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.is_public:
        raise HTTPException(status_code=403, detail="Agent not available")

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        display_name=agent.display_name,
        description=agent.description,
        category=agent.category,
        agent_type=agent.agent_type,
        capabilities=agent.capabilities,
        status=agent.status,
        is_public=agent.is_public,
        icon_url=agent.icon_url,
        tags=agent.tags,
        total_requests=agent.total_requests,
        success_rate=agent.success_rate
    )


@router.post("", response_model=AgentResponse)
async def create_agent(
    agent_data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Create a new marketplace agent (admin only)."""
    agent = Agent(**agent_data.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        display_name=agent.display_name,
        description=agent.description,
        category=agent.category,
        agent_type=agent.agent_type,
        capabilities=agent.capabilities,
        status=agent.status,
        is_public=agent.is_public,
        icon_url=agent.icon_url,
        tags=agent.tags,
        total_requests=agent.total_requests,
        success_rate=agent.success_rate
    )


@router.get("/categories/list")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get list of available agent categories."""
    result = await db.execute(
        select(Agent.category)
        .where(Agent.is_public == True)
        .where(Agent.status == "active")
        .distinct()
    )
    categories = result.scalars().all()

    return {"categories": categories}
