"""
Knowledge base management endpoints for RAG.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.vector_service import vector_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class KnowledgeAddRequest(BaseModel):
    """Request to add knowledge chunks."""
    knowledge_base_id: str
    texts: List[str]
    source_type: Optional[str] = "text"
    source_uri: Optional[str] = None


class KnowledgeSearchRequest(BaseModel):
    """Request to search knowledge base."""
    knowledge_base_id: str
    query: str
    top_k: Optional[int] = None


@router.post("/add")
async def add_knowledge(
    request: KnowledgeAddRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Add knowledge chunks to a knowledge base.

    This endpoint generates embeddings and stores them in pgvector.
    """
    try:
        chunks = await vector_service.add_knowledge(
            db=db,
            knowledge_base_id=request.knowledge_base_id,
            texts=request.texts,
            source_type=request.source_type,
            source_uri=request.source_uri
        )

        return {
            "status": "success",
            "knowledge_base_id": request.knowledge_base_id,
            "chunks_added": len(chunks),
            "chunk_ids": [chunk.id for chunk in chunks]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding knowledge: {str(e)}")


@router.post("/search")
async def search_knowledge(
    request: KnowledgeSearchRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Search knowledge base using semantic similarity.

    Returns the most relevant chunks based on vector similarity.
    """
    try:
        results = await vector_service.search_similar(
            db=db,
            knowledge_base_id=request.knowledge_base_id,
            query=request.query,
            top_k=request.top_k
        )

        return {
            "status": "success",
            "query": request.query,
            "results": results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching knowledge: {str(e)}")


@router.delete("/{knowledge_base_id}")
async def delete_knowledge_base(
    knowledge_base_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Delete all chunks from a knowledge base."""
    try:
        count = await vector_service.delete_knowledge_base(
            db=db,
            knowledge_base_id=knowledge_base_id
        )

        return {
            "status": "success",
            "knowledge_base_id": knowledge_base_id,
            "chunks_deleted": count
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting knowledge base: {str(e)}")
