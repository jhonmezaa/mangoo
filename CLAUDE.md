# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mangoo is a multi-agent AI platform built on AWS with FastAPI backend, React frontend, and Aurora PostgreSQL with pgvector for RAG. It's deployed on ECS Fargate with full CDK infrastructure automation.

## Tech Stack

- **Backend**: FastAPI 0.109, Python 3.11, Uvicorn, SQLAlchemy (async), psycopg3
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Database**: Aurora PostgreSQL Serverless v2 with pgvector extension
- **AI**: Amazon Bedrock (Claude 3.5 Sonnet, Titan Embeddings v2)
- **Auth**: Amazon Cognito with JWT
- **Infrastructure**: AWS CDK (TypeScript), ECS Fargate, ALB, API Gateway, WAF
- **CI/CD**: AWS CodeBuild (native AWS, no static credentials)

## Development Commands

### Backend

```bash
# Local development
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload --port 8000

# Run tests
pytest tests/ --cov=app

# Database migrations (if using Alembic)
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Development server on port 3000
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
```

### Infrastructure

```bash
cd cdk
npm install
npm run build        # Compile TypeScript
cdk diff             # Show changes
cdk deploy           # Deploy stack
cdk destroy          # Destroy stack
cdk synth            # Synthesize CloudFormation
```

### Docker

```bash
# Local development stack
docker-compose up -d
docker-compose logs -f backend
docker-compose down

# Build individual services
docker build -t mangoo-backend ./backend
docker build -t mangoo-frontend ./frontend
```

## Architecture and Key Patterns

### Backend Architecture

The backend follows a modular FastAPI structure running directly with Uvicorn (no NGINX):

- **app/api/routes/**: API endpoints organized by domain (chat, bots, knowledge, agents, users)
- **app/services/**: Business logic services (bedrock_service, vector_service)
- **app/models/**: SQLAlchemy ORM models (User, Bot, Message, KnowledgeChunk, Agent)
- **app/middleware/**: JWT authentication middleware for Cognito
- **app/core/**: Configuration and database setup

**Key Patterns**:

1. **Direct Uvicorn Deployment**: No reverse proxy (NGINX) in the container
2. **Proxy Headers**: Uvicorn configured with `--proxy-headers` and `--forwarded-allow-ips="*"`
3. **Async/Await**: All database operations and Bedrock calls use async
4. **Dependency Injection**: FastAPI's `Depends()` for database sessions and auth
5. **SSE Streaming**: Chat endpoint streams responses using `StreamingResponse` and async generators
6. **ALB Integration**: Application Load Balancer with 120s idle timeout for SSE support
7. **Repository Pattern**: Services abstract database operations from routes
8. **Pydantic Models**: Request/response validation with Pydantic schemas

### Database Schema Key Points

- Users table uses Cognito `sub` as primary key
- Bots have owner_id foreign key to users
- Messages reference bot_id, user_id, and chat_id for conversation grouping
- KnowledgeChunk uses pgvector for embeddings (dimension 1024 for Titan v2)
- Use `<=>` operator for cosine distance in pgvector queries

### SSE Streaming Pattern

```python
async def event_generator():
    yield await format_sse_message(json.dumps({"type": "start"}), event="start")
    async for chunk in bedrock_service.invoke_model_stream(...):
        yield await format_sse_message(json.dumps({"content": chunk}), event="message")
    yield await format_sse_message(json.dumps({"type": "done"}), event="done")

return StreamingResponse(event_generator(), media_type="text/event-stream")
```

### Bedrock Integration

- Use `converse_stream()` API for streaming chat (not `invoke_model_with_response_stream`)
- Bedrock returns events: `contentBlockDelta` (text chunks) and `metadata` (usage stats)
- Titan Embeddings v2 returns 1024-dimensional vectors (not 1536)
- Always handle Bedrock exceptions gracefully

### Vector Search with pgvector

```python
# Vector similarity search using cosine distance
query_text = text("""
    SELECT id, text, 1 - (embedding <=> :query_embedding) AS similarity
    FROM knowledge_chunks
    WHERE knowledge_base_id = :kb_id
    AND 1 - (embedding <=> :query_embedding) > :threshold
    ORDER BY embedding <=> :query_embedding
    LIMIT :limit
""")
```

### Frontend Architecture

- **pages/**: Route components (Login, Dashboard, Chat, Marketplace, Bots)
- **services/**: API clients (auth.ts, api.ts)
- **stores/**: Zustand state management (authStore.ts)
- **components/**: Reusable UI components (to be added)

**Key Patterns**:

1. **Cognito Auth**: Use `amazon-cognito-identity-js` for authentication
2. **Axios Interceptors**: Automatically add JWT tokens to requests
3. **SSE Client**: Native EventSource API for streaming responses
4. **Zustand**: Lightweight state management with persistence

### CDK Infrastructure Patterns

- VPC with public, private (NAT), and isolated subnets
- Aurora in isolated subnets, ECS in private with egress
- Security groups: backend → database (5432), ALB → backend (8000)
- ECS auto-scaling based on CPU (70%) and memory (80%)
- ALB idle timeout must be ≥ 120s for SSE support

## Common Tasks

### Adding a New API Endpoint

1. Create route function in `backend/app/api/routes/<domain>.py`
2. Add Pydantic schemas for request/response
3. Use `Depends(get_db)` for database access
4. Use `Depends(get_current_user_id)` for authentication
5. Add route to router with appropriate tags
6. Update `app/main.py` to include router if new domain

### Adding a New Database Model

1. Create model in `backend/app/models/<name>.py` inheriting from `Base`
2. Import in `backend/app/models/__init__.py`
3. Run `alembic revision --autogenerate -m "add <name> table"`
4. Review and apply migration with `alembic upgrade head`

### Adding a New Frontend Page

1. Create component in `frontend/src/pages/<Name>.tsx`
2. Add route in `frontend/src/App.tsx`
3. Use `useAuthStore` for authentication check
4. Use `api` from `services/api.ts` for backend calls

### Testing SSE Locally

```bash
# Terminal 1: Start backend
cd backend && uvicorn app.main:app --reload

# Terminal 2: Test SSE endpoint
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8000/api/v1/chat/stream \
  -d '{"bot_id":"<bot-id>","message":"Hello"}'
```

## Environment Variables

### Backend (.env)

Required:
- `DATABASE_URL`: PostgreSQL connection string
- `COGNITO_USER_POOL_ID`: Cognito user pool
- `COGNITO_APP_CLIENT_ID`: Cognito app client
- `SECRET_KEY`: Secret for JWT validation
- `BEDROCK_MODEL_ID`: Default model (Claude 3.5 Sonnet)
- `BEDROCK_EMBEDDING_MODEL_ID`: Titan Embeddings v2

Optional:
- `DEBUG`: Enable debug mode (default: false)
- `BEDROCK_REGION`: AWS region for Bedrock (default: us-east-1)

### Frontend (.env)

Required:
- `VITE_API_URL`: Backend API URL
- `VITE_COGNITO_USER_POOL_ID`: Cognito user pool
- `VITE_COGNITO_CLIENT_ID`: Cognito app client
- `VITE_COGNITO_REGION`: AWS region

## Known Issues and Gotchas

1. **pgvector dimension**: Titan Embeddings v2 uses 1024, not 1536 (v1)
2. **SSE streaming**: No NGINX in backend container - Uvicorn handles SSE directly
3. **ALB idle timeout**: Must be set to 120s minimum for SSE connections
4. **Proxy headers**: Uvicorn must use `--proxy-headers` flag to trust ALB headers
5. **Cognito JWT**: Use `cognito:groups` claim for role-based access
6. **ECS health checks**: Use `/health` endpoint, not `/`
7. **Aurora Serverless v2**: Min ACU must be ≥ 0.5 for pgvector
8. **Bedrock streaming**: Use `converse_stream()` API, not legacy `invoke_model_with_response_stream()`

## Security Considerations

- Never commit `.env` files or secrets
- Use AWS Secrets Manager for production credentials
- Validate all user inputs with Pydantic
- Use parameterized queries to prevent SQL injection
- CORS is configured in FastAPI middleware (update `ALLOWED_ORIGINS`)
- Cognito enforces strong password policies (see CDK stack)
- WAF rules include rate limiting (2000 req/5min per IP)

## Deployment Notes

- CDK stack takes ~15 minutes to deploy Aurora cluster
- ECS tasks may fail on first deploy until database is ready
- Use `cdk deploy --require-approval never` for CI/CD
- ECR repositories must be created before pushing images
- Frontend nginx serves from `/usr/share/nginx/html`
- Backend runs on port 8000, frontend on port 80 (nginx)

## Troubleshooting

### "Module not found" in backend
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt`

### Frontend build fails
- Delete `node_modules` and run `npm install`
- Check Node version (requires 20+)

### SSE not working
- Check ALB idle timeout (≥ 120s)
- Verify `proxy_buffering off` in nginx.conf
- Check browser developer console for errors

### Database connection fails
- Verify security group allows traffic from backend SG
- Check DATABASE_URL format: `postgresql+asyncpg://...`
- Ensure pgvector extension is enabled

### Bedrock access denied
- Verify IAM role has `bedrock:InvokeModel` permission
- Check model access in Bedrock console
- Ensure model ID is correct for your region

## Performance Optimization

- Use connection pooling (configured in `core/database.py`)
- Cache Cognito JWKS in `middleware/auth.py`
- Batch embedding generation in `vector_service.py`
- Use Aurora read replicas for read-heavy workloads
- Enable CloudFront caching for static frontend assets
- Monitor Bedrock token usage to optimize costs

## Future Enhancements

When adding features, consider:

1. **Multi-tenancy**: Add `tenant_id` to all tables for isolation
2. **Agent orchestration**: Use EventBridge or SQS for async agent communication
3. **Observability**: Add OpenTelemetry tracing for distributed requests
4. **Caching**: Use Redis/ElastiCache for session and embedding caching
5. **File uploads**: Use S3 with presigned URLs for document ingestion
6. **Websockets**: Consider upgrading from SSE to WebSocket for bidirectional communication
