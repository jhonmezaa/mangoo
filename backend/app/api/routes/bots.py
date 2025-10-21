"""
Bot management endpoints.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel

from app.core.database import get_db
from app.middleware.auth import get_current_user_id
from app.models.bot import Bot

router = APIRouter(prefix="/bots", tags=["bots"])


class BotCreate(BaseModel):
    """Bot creation schema."""
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    model_id: str
    temperature: int = 70  # 0-100
    max_tokens: int = 4096
    rag_enabled: bool = False
    knowledge_base_id: Optional[str] = None
    is_public: bool = False
    is_marketplace: bool = False
    tags: Optional[List[str]] = None


class BotUpdate(BaseModel):
    """Bot update schema."""
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    model_id: Optional[str] = None
    temperature: Optional[int] = None
    max_tokens: Optional[int] = None
    rag_enabled: Optional[bool] = None
    knowledge_base_id: Optional[str] = None
    is_public: Optional[bool] = None
    is_marketplace: Optional[bool] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None


class BotResponse(BaseModel):
    """Bot response schema."""
    id: str
    name: str
    description: Optional[str]
    instructions: Optional[str]
    model_id: str
    temperature: int
    max_tokens: int
    rag_enabled: bool
    knowledge_base_id: Optional[str]
    owner_id: str
    is_public: bool
    is_marketplace: bool
    is_active: bool
    tags: Optional[List[str]]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=BotResponse)
async def create_bot(
    bot_data: BotCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Create a new bot."""
    bot = Bot(
        **bot_data.model_dump(),
        owner_id=user_id
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)

    return BotResponse(
        id=bot.id,
        name=bot.name,
        description=bot.description,
        instructions=bot.instructions,
        model_id=bot.model_id,
        temperature=bot.temperature,
        max_tokens=bot.max_tokens,
        rag_enabled=bot.rag_enabled,
        knowledge_base_id=bot.knowledge_base_id,
        owner_id=bot.owner_id,
        is_public=bot.is_public,
        is_marketplace=bot.is_marketplace,
        is_active=bot.is_active,
        tags=bot.tags,
        created_at=bot.created_at.isoformat(),
        updated_at=bot.updated_at.isoformat()
    )


@router.get("", response_model=List[BotResponse])
async def list_bots(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    include_public: bool = True,
    marketplace_only: bool = False
):
    """List bots accessible to the current user."""
    query = select(Bot).where(Bot.is_active == True)

    if marketplace_only:
        query = query.where(Bot.is_marketplace == True)
    elif include_public:
        query = query.where(
            or_(
                Bot.owner_id == user_id,
                Bot.is_public == True
            )
        )
    else:
        query = query.where(Bot.owner_id == user_id)

    result = await db.execute(query.order_by(Bot.created_at.desc()))
    bots = result.scalars().all()

    return [
        BotResponse(
            id=bot.id,
            name=bot.name,
            description=bot.description,
            instructions=bot.instructions,
            model_id=bot.model_id,
            temperature=bot.temperature,
            max_tokens=bot.max_tokens,
            rag_enabled=bot.rag_enabled,
            knowledge_base_id=bot.knowledge_base_id,
            owner_id=bot.owner_id,
            is_public=bot.is_public,
            is_marketplace=bot.is_marketplace,
            is_active=bot.is_active,
            tags=bot.tags,
            created_at=bot.created_at.isoformat(),
            updated_at=bot.updated_at.isoformat()
        )
        for bot in bots
    ]


@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(
    bot_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific bot by ID."""
    result = await db.execute(select(Bot).where(Bot.id == bot_id))
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Check access permissions
    if not bot.is_public and bot.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return BotResponse(
        id=bot.id,
        name=bot.name,
        description=bot.description,
        instructions=bot.instructions,
        model_id=bot.model_id,
        temperature=bot.temperature,
        max_tokens=bot.max_tokens,
        rag_enabled=bot.rag_enabled,
        knowledge_base_id=bot.knowledge_base_id,
        owner_id=bot.owner_id,
        is_public=bot.is_public,
        is_marketplace=bot.is_marketplace,
        is_active=bot.is_active,
        tags=bot.tags,
        created_at=bot.created_at.isoformat(),
        updated_at=bot.updated_at.isoformat()
    )


@router.patch("/{bot_id}", response_model=BotResponse)
async def update_bot(
    bot_id: str,
    bot_data: BotUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Update a bot."""
    result = await db.execute(select(Bot).where(Bot.id == bot_id))
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Only owner can update
    if bot.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update fields
    for field, value in bot_data.model_dump(exclude_unset=True).items():
        setattr(bot, field, value)

    await db.commit()
    await db.refresh(bot)

    return BotResponse(
        id=bot.id,
        name=bot.name,
        description=bot.description,
        instructions=bot.instructions,
        model_id=bot.model_id,
        temperature=bot.temperature,
        max_tokens=bot.max_tokens,
        rag_enabled=bot.rag_enabled,
        knowledge_base_id=bot.knowledge_base_id,
        owner_id=bot.owner_id,
        is_public=bot.is_public,
        is_marketplace=bot.is_marketplace,
        is_active=bot.is_active,
        tags=bot.tags,
        created_at=bot.created_at.isoformat(),
        updated_at=bot.updated_at.isoformat()
    )


@router.delete("/{bot_id}")
async def delete_bot(
    bot_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Delete a bot."""
    result = await db.execute(select(Bot).where(Bot.id == bot_id))
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Only owner can delete
    if bot.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    await db.delete(bot)
    await db.commit()

    return {"status": "success", "id": bot_id}
