"""
User management endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime

from app.core.database import get_db
from app.middleware.auth import get_current_user, get_current_user_id
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UserResponse(BaseModel):
    """User response schema."""
    id: str
    email: str
    username: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str]

    class Config:
        from_attributes = True


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get current user information."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None
    )


@router.post("/register")
async def register_user(
    user_data: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Register or update user from Cognito token.

    This endpoint is called after successful Cognito authentication.
    """
    user_id = user_data["sub"]
    email = user_data.get("email")
    username = user_data.get("cognito:username", email)

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user:
        # Update last login
        user.last_login = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
    else:
        # Create new user
        user = User(
            id=user_id,
            email=email,
            username=username,
            full_name=user_data.get("name"),
            last_login=datetime.utcnow()
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None
    )
