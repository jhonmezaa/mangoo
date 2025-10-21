#!/usr/bin/env python3
"""
Seed database with sample data for testing.
"""
import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.database import AsyncSessionLocal
from app.models import User, Bot, Agent


async def main():
    """Seed database with sample data."""
    print("🌱 Seeding database...")

    async with AsyncSessionLocal() as db:
        try:
            # Create sample user
            sample_user_id = str(uuid.uuid4())
            user = User(
                id=sample_user_id,
                email="demo@example.com",
                username="demo",
                full_name="Demo User",
                role="user"
            )
            db.add(user)

            # Create sample admin user
            admin_user_id = str(uuid.uuid4())
            admin = User(
                id=admin_user_id,
                email="admin@example.com",
                username="admin",
                full_name="Admin User",
                role="admin"
            )
            db.add(admin)

            # Create sample bots
            bots = [
                Bot(
                    name="General Assistant",
                    description="A helpful general-purpose AI assistant",
                    instructions="You are a helpful, friendly, and knowledgeable assistant.",
                    model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
                    temperature=70,
                    max_tokens=4096,
                    owner_id=sample_user_id,
                    is_public=True,
                    tags=["general", "helpful"]
                ),
                Bot(
                    name="Code Expert",
                    description="Specialized in programming and software development",
                    instructions="You are an expert programmer. Help users with code, debugging, and best practices.",
                    model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
                    temperature=50,
                    max_tokens=8000,
                    owner_id=sample_user_id,
                    is_public=True,
                    tags=["coding", "development"]
                ),
                Bot(
                    name="RAG Assistant",
                    description="Uses knowledge base for enhanced responses",
                    instructions="You answer questions based on the provided context.",
                    model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
                    temperature=60,
                    max_tokens=4096,
                    rag_enabled=True,
                    knowledge_base_id="demo-kb",
                    owner_id=sample_user_id,
                    is_public=False,
                    tags=["rag", "knowledge"]
                ),
            ]

            for bot in bots:
                db.add(bot)

            # Create sample marketplace agents
            agents = [
                Agent(
                    name="sap-expert",
                    display_name="SAP Expert Assistant",
                    description="Specialized agent for SAP ERP queries, transaction help, and troubleshooting",
                    category="sap",
                    agent_type="conversational",
                    capabilities=["sap-queries", "transaction-codes", "error-resolution", "best-practices"],
                    is_public=True,
                    tags=["sap", "erp", "enterprise"],
                    config={"max_context": 10, "temperature": 0.6}
                ),
                Agent(
                    name="aws-devops",
                    display_name="AWS DevOps Expert",
                    description="Helps with AWS infrastructure, CloudFormation, CDK, and DevOps practices",
                    category="aws",
                    agent_type="task-executor",
                    capabilities=["cloudformation", "cdk", "troubleshooting", "best-practices"],
                    is_public=True,
                    tags=["aws", "devops", "cloud"],
                    config={"max_context": 15, "temperature": 0.5}
                ),
                Agent(
                    name="azure-devops",
                    display_name="Azure DevOps Specialist",
                    description="Expert in Azure DevOps pipelines, infrastructure, and automation",
                    category="azure",
                    agent_type="task-executor",
                    capabilities=["pipelines", "arm-templates", "azure-cli", "automation"],
                    is_public=True,
                    tags=["azure", "devops", "ci-cd"],
                    config={"max_context": 12, "temperature": 0.5}
                ),
                Agent(
                    name="data-analyst",
                    display_name="Data Analysis Expert",
                    description="Analyzes data, creates visualizations, and provides insights",
                    category="general",
                    agent_type="data-analyzer",
                    capabilities=["data-analysis", "visualization", "statistics", "reporting"],
                    is_public=True,
                    tags=["data", "analytics", "insights"],
                    config={"max_context": 20, "temperature": 0.3}
                ),
            ]

            for agent in agents:
                db.add(agent)

            await db.commit()

            print("✅ Sample data created:")
            print(f"   - Users: demo@example.com, admin@example.com")
            print(f"   - Bots: {len(bots)} bots")
            print(f"   - Agents: {len(agents)} marketplace agents")

        except Exception as e:
            await db.rollback()
            print(f"❌ Error seeding data: {e}")
            sys.exit(1)

    print("\n🎉 Database seeded successfully!")
    print("\n💡 You can now login with:")
    print("   Email: demo@example.com")
    print("   (Create user in Cognito with this email)")


if __name__ == "__main__":
    asyncio.run(main())
