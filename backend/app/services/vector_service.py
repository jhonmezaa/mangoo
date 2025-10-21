"""
Vector search service using pgvector for RAG.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.knowledge import KnowledgeChunk
from app.services.bedrock_service import bedrock_service
from app.core.config import settings


class VectorService:
    """Service for vector search and RAG operations."""

    def __init__(self):
        self.bedrock = bedrock_service

    async def add_knowledge(
        self,
        db: AsyncSession,
        knowledge_base_id: str,
        texts: List[str],
        source_type: Optional[str] = None,
        source_uri: Optional[str] = None,
        metadata: Optional[List[Dict[str, Any]]] = None
    ) -> List[KnowledgeChunk]:
        """
        Add texts to knowledge base with embeddings.

        Args:
            db: Database session
            knowledge_base_id: ID of knowledge base
            texts: List of text chunks
            source_type: Type of source (pdf, url, etc.)
            source_uri: URI of source document
            metadata: Optional metadata for each chunk

        Returns:
            List of created KnowledgeChunk objects
        """
        # Generate embeddings
        embeddings = await self.bedrock.generate_embeddings(texts)

        # Create knowledge chunks
        chunks = []
        for i, (text, embedding) in enumerate(zip(texts, embeddings)):
            chunk_metadata = metadata[i] if metadata and i < len(metadata) else {}

            chunk = KnowledgeChunk(
                knowledge_base_id=knowledge_base_id,
                text=text,
                embedding=embedding,
                source_type=source_type,
                source_uri=source_uri,
                chunk_index=str(i),
                metadata=chunk_metadata
            )
            db.add(chunk)
            chunks.append(chunk)

        await db.commit()
        return chunks

    async def search_similar(
        self,
        db: AsyncSession,
        knowledge_base_id: str,
        query: str,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar knowledge chunks using vector similarity.

        Args:
            db: Database session
            knowledge_base_id: ID of knowledge base to search
            query: Query text
            top_k: Number of results to return
            similarity_threshold: Minimum similarity score

        Returns:
            List of matching chunks with similarity scores
        """
        top_k = top_k or settings.VECTOR_TOP_K
        similarity_threshold = similarity_threshold or settings.VECTOR_SIMILARITY_THRESHOLD

        # Generate query embedding
        query_embeddings = await self.bedrock.generate_embeddings([query])
        query_embedding = query_embeddings[0]

        # Perform vector search using cosine distance
        # Note: pgvector uses <=> for cosine distance (0 = identical, 2 = opposite)
        # We convert to similarity: 1 - (distance / 2)
        query_text = text("""
            SELECT
                id,
                text,
                source_type,
                source_uri,
                chunk_index,
                metadata,
                1 - (embedding <=> :query_embedding) AS similarity
            FROM knowledge_chunks
            WHERE knowledge_base_id = :kb_id
            AND 1 - (embedding <=> :query_embedding) > :threshold
            ORDER BY embedding <=> :query_embedding
            LIMIT :limit
        """)

        result = await db.execute(
            query_text,
            {
                "query_embedding": str(query_embedding),
                "kb_id": knowledge_base_id,
                "threshold": similarity_threshold,
                "limit": top_k
            }
        )

        rows = result.fetchall()

        return [
            {
                "id": row[0],
                "text": row[1],
                "source_type": row[2],
                "source_uri": row[3],
                "chunk_index": row[4],
                "metadata": row[5],
                "similarity": float(row[6])
            }
            for row in rows
        ]

    async def delete_knowledge_base(
        self,
        db: AsyncSession,
        knowledge_base_id: str
    ) -> int:
        """
        Delete all chunks from a knowledge base.

        Returns:
            Number of chunks deleted
        """
        result = await db.execute(
            select(KnowledgeChunk).where(
                KnowledgeChunk.knowledge_base_id == knowledge_base_id
            )
        )
        chunks = result.scalars().all()
        count = len(chunks)

        for chunk in chunks:
            await db.delete(chunk)

        await db.commit()
        return count


# Singleton instance
vector_service = VectorService()
