"""
Knowledge base model with pgvector for semantic search.
"""
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, JSON, Index
from pgvector.sqlalchemy import Vector
from app.core.database import Base
from app.core.config import settings
import uuid


class KnowledgeChunk(Base):
    """Knowledge chunk with vector embeddings for RAG."""

    __tablename__ = "knowledge_chunks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)

    # Knowledge base reference
    knowledge_base_id = Column(String(36), nullable=False, index=True)

    # Content
    text = Column(Text, nullable=False)
    embedding = Column(Vector(settings.VECTOR_DIMENSION), nullable=False)

    # Source metadata
    source_type = Column(String(50), nullable=True)  # pdf, url, text, etc.
    source_uri = Column(Text, nullable=True)
    chunk_index = Column(String(50), nullable=True)  # Position in original document

    # Additional metadata
    metadata = Column(JSON, default=dict, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<KnowledgeChunk {self.id} (kb={self.knowledge_base_id})>"


# Create index for vector similarity search using cosine distance
Index(
    "idx_knowledge_embedding",
    KnowledgeChunk.embedding,
    postgresql_using="ivfflat",
    postgresql_with={"lists": 100},
    postgresql_ops={"embedding": "vector_cosine_ops"}
)
