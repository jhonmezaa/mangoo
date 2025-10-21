#!/usr/bin/env python3
"""
Database initialization script.
Creates tables and enables pgvector extension.
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.database import init_db, engine
from app.models import User, Bot, Message, KnowledgeChunk, Agent


async def main():
    """Initialize database."""
    print("🚀 Initializing database...")

    try:
        # Initialize database (creates tables and enables pgvector)
        await init_db()
        print("✅ Database initialized successfully!")

        # Verify pgvector extension
        async with engine.begin() as conn:
            result = await conn.execute(
                "SELECT * FROM pg_extension WHERE extname = 'vector'"
            )
            if result.fetchone():
                print("✅ pgvector extension enabled")
            else:
                print("⚠️  pgvector extension not found")

        # Display table information
        async with engine.begin() as conn:
            result = await conn.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                ORDER BY table_name
            """)
            tables = [row[0] for row in result.fetchall()]
            print(f"\n📊 Created tables: {', '.join(tables)}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

    print("\n🎉 Database is ready!")


if __name__ == "__main__":
    asyncio.run(main())
