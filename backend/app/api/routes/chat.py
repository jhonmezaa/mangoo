"""
Chat endpoints with SSE streaming support.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
import json

from app.core.database import get_db
from app.middleware.auth import get_current_user_id
from app.models.bot import Bot
from app.models.message import Message
from app.services.bedrock_service import bedrock_service
from app.services.vector_service import vector_service

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    """Chat message schema."""
    role: str
    content: str


class ChatRequest(BaseModel):
    """Chat request schema."""
    bot_id: str
    message: str
    chat_id: Optional[str] = None
    use_rag: bool = False


class ChatHistoryResponse(BaseModel):
    """Chat history response schema."""
    chat_id: str
    messages: List[dict]


async def format_sse_message(data: str, event: Optional[str] = None) -> str:
    """Format message for Server-Sent Events."""
    message = ""
    if event:
        message += f"event: {event}\n"
    message += f"data: {data}\n\n"
    return message


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Stream chat response using SSE.

    This endpoint streams the AI response token-by-token using Server-Sent Events.
    """
    # Get bot
    result = await db.execute(
        select(Bot).where(Bot.id == request.bot_id)
    )
    bot = result.scalar_one_or_none()

    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Check access permissions
    if not bot.is_public and bot.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Generate chat_id if not provided
    chat_id = request.chat_id or f"chat_{datetime.utcnow().timestamp()}"

    # Get conversation history
    history_result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .where(Message.bot_id == request.bot_id)
        .order_by(Message.created_at.asc())
        .limit(20)
    )
    history = history_result.scalars().all()

    # Build message list
    messages = [
        {"role": msg.role, "content": msg.content}
        for msg in history
    ]
    messages.append({"role": "user", "content": request.message})

    # RAG context if enabled
    context_chunks = []
    if request.use_rag and bot.rag_enabled and bot.knowledge_base_id:
        context_chunks = await vector_service.search_similar(
            db=db,
            knowledge_base_id=bot.knowledge_base_id,
            query=request.message,
            top_k=5
        )

        if context_chunks:
            context_text = "\n\n".join([
                f"Context {i+1}: {chunk['text']}"
                for i, chunk in enumerate(context_chunks)
            ])
            rag_message = (
                f"Use the following context to answer the question:\n\n{context_text}\n\n"
                f"Question: {request.message}"
            )
            messages[-1]["content"] = rag_message

    # Save user message
    user_message = Message(
        chat_id=chat_id,
        bot_id=bot.id,
        user_id=user_id,
        role="user",
        content=request.message
    )
    db.add(user_message)
    await db.commit()

    async def event_generator():
        """Generate SSE events."""
        try:
            # Send initial event with chat_id
            yield await format_sse_message(
                json.dumps({"chat_id": chat_id, "type": "start"}),
                event="start"
            )

            # Stream response
            full_response = ""
            async for chunk in bedrock_service.invoke_model_stream(
                messages=messages,
                model_id=bot.model_id,
                system_prompt=bot.instructions,
                temperature=bot.temperature / 100.0,
                max_tokens=bot.max_tokens
            ):
                full_response += chunk
                yield await format_sse_message(
                    json.dumps({"content": chunk, "type": "content"}),
                    event="message"
                )

            # Save assistant message
            assistant_message = Message(
                chat_id=chat_id,
                bot_id=bot.id,
                user_id=user_id,
                role="assistant",
                content=full_response,
                model_id=bot.model_id,
                context_used=[c["id"] for c in context_chunks] if context_chunks else []
            )
            db.add(assistant_message)
            await db.commit()

            # Send completion event
            yield await format_sse_message(
                json.dumps({"type": "done", "chat_id": chat_id}),
                event="done"
            )

        except Exception as e:
            yield await format_sse_message(
                json.dumps({"error": str(e), "type": "error"}),
                event="error"
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@router.get("/history/{chat_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get chat history for a conversation."""
    result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .where(Message.user_id == user_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()

    return {
        "chat_id": chat_id,
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
                "model_id": msg.model_id,
            }
            for msg in messages
        ]
    }


@router.delete("/history/{chat_id}")
async def delete_chat_history(
    chat_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Delete chat history."""
    result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .where(Message.user_id == user_id)
    )
    messages = result.scalars().all()

    for msg in messages:
        await db.delete(msg)

    await db.commit()

    return {"status": "success", "deleted_count": len(messages)}
