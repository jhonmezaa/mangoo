# Architecture Documentation

## System Overview

Mangoo is a serverless-first, multi-agent AI platform built on AWS. It follows a microservices-oriented architecture with clear separation of concerns.

```
┌─────────────┐
│   Users     │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────────┐      ┌──────────────┐
│   CloudFront    │──────│  S3 (Static) │
│   (Frontend)    │      └──────────────┘
└─────────────────┘
       │
       │ HTTPS
       ▼
┌─────────────────┐      ┌──────────────┐
│  API Gateway    │──────│     WAF      │
│  (HTTP API)     │      └──────────────┘
└────────┬────────┘
         │ VPC Link
         ▼
┌─────────────────┐
│       ALB       │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ECS Task│ │ECS Task│  (FastAPI Backend)
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Aurora │ │Bedrock │
│ Postgres│ │ (AI)   │
└────────┘ └────────┘
```

## Components

### Frontend (React + Vite)

**Technology**:
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- React Router for routing

**Deployment**:
- Built as static files
- Hosted on S3
- Distributed via CloudFront
- Nginx container for SSR if needed

**Key Features**:
- Server-Sent Events (SSE) client for streaming
- Cognito integration for auth
- Responsive design with Tailwind
- Code splitting for optimal loading

### Backend (FastAPI)

**Technology**:
- FastAPI 0.109 (async framework)
- Python 3.11
- Uvicorn ASGI server
- SQLAlchemy 2.0 (async)
- Pydantic for validation

**Architecture Patterns**:
- **Layered Architecture**:
  - Routes (API layer)
  - Services (business logic)
  - Models (data layer)
  - Middleware (cross-cutting concerns)

- **Dependency Injection**: FastAPI's `Depends()` for:
  - Database sessions
  - Authentication
  - Configuration

- **Async/Await**: All I/O operations are async:
  - Database queries
  - Bedrock API calls
  - HTTP requests

**Key Modules**:

```
app/
├── api/routes/      # API endpoints
│   ├── chat.py      # Chat + SSE streaming
│   ├── bots.py      # Bot CRUD
│   ├── knowledge.py # RAG operations
│   ├── agents.py    # Marketplace agents
│   └── users.py     # User management
├── services/        # Business logic
│   ├── bedrock_service.py  # Bedrock integration
│   └── vector_service.py   # Vector search
├── models/          # SQLAlchemy ORM
│   ├── user.py
│   ├── bot.py
│   ├── message.py
│   ├── knowledge.py
│   └── agent.py
├── middleware/      # Request/response processing
│   └── auth.py      # JWT validation
├── core/           # Core configuration
│   ├── config.py
│   └── database.py
└── main.py         # Application entry point
```

### Database (Aurora PostgreSQL)

**Configuration**:
- Aurora PostgreSQL 15.5
- Serverless v2 (0.5-2 ACU)
- Multi-AZ deployment
- pgvector extension enabled

**Schema Design**:

```sql
-- Users (from Cognito)
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,  -- Cognito sub
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bots
CREATE TABLE bots (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  model_id VARCHAR(255) NOT NULL,
  instructions TEXT,
  owner_id VARCHAR(255) REFERENCES users(id),
  rag_enabled BOOLEAN DEFAULT FALSE,
  knowledge_base_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages (Chat History)
CREATE TABLE messages (
  id VARCHAR(36) PRIMARY KEY,
  chat_id VARCHAR(36) NOT NULL,
  bot_id VARCHAR(36) REFERENCES bots(id),
  user_id VARCHAR(255) REFERENCES users(id),
  role VARCHAR(20) NOT NULL,  -- user, assistant
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge Chunks (RAG)
CREATE TABLE knowledge_chunks (
  id VARCHAR(36) PRIMARY KEY,
  knowledge_base_id VARCHAR(36) NOT NULL,
  text TEXT NOT NULL,
  embedding vector(1024),  -- pgvector
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Marketplace Agents
CREATE TABLE agents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_knowledge_kb_id ON knowledge_chunks(knowledge_base_id);
CREATE INDEX idx_knowledge_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### AI Services (Amazon Bedrock)

**Models Used**:

1. **Claude 3.5 Sonnet v2** (`anthropic.claude-3-5-sonnet-20241022-v2:0`)
   - Conversational AI
   - Streaming responses
   - Context window: 200k tokens

2. **Titan Embeddings v2** (`amazon.titan-embed-text-v2:0`)
   - Text embeddings
   - Dimension: 1024
   - Used for RAG

**Integration Pattern**:

```python
# Streaming inference
async def invoke_model_stream(messages, system_prompt):
    response = bedrock.converse_stream(
        modelId=model_id,
        messages=messages,
        system=[{"text": system_prompt}],
        inferenceConfig={
            "temperature": 0.7,
            "maxTokens": 4096
        }
    )

    for event in response["stream"]:
        if "contentBlockDelta" in event:
            yield event["contentBlockDelta"]["delta"]["text"]
```

**Cost Optimization**:
- Cache embeddings in database
- Use temperature and max_tokens to control output
- Monitor usage via CloudWatch
- Implement request batching where possible

### Vector Search (pgvector)

**Vector Storage**:
- Embeddings stored as `vector(1024)` column
- IVFFLAT index for approximate nearest neighbor search
- Cosine distance for similarity

**Search Pattern**:

```python
# Semantic search
async def search_similar(query: str, top_k: int = 5):
    # Generate query embedding
    embedding = await bedrock.generate_embeddings([query])

    # Vector similarity search
    results = await db.execute("""
        SELECT text, 1 - (embedding <=> :query_emb) AS similarity
        FROM knowledge_chunks
        WHERE 1 - (embedding <=> :query_emb) > 0.7
        ORDER BY embedding <=> :query_emb
        LIMIT :top_k
    """, {"query_emb": embedding[0], "top_k": top_k})

    return results
```

**Performance**:
- IVFFLAT index reduces search from O(n) to O(√n)
- Lists parameter (100) balances accuracy vs speed
- Similarity threshold (0.7) filters low-quality results

### Authentication (AWS Cognito)

**User Pool Configuration**:
- Email + username sign-in
- Strong password policy
- Email verification required
- MFA optional

**JWT Validation**:

```python
# Middleware validates every request
async def verify_token(token: str):
    # Fetch JWKS from Cognito
    jwks = await get_jwks()

    # Decode and verify
    payload = jwt.decode(
        token,
        jwks,
        algorithms=["RS256"],
        audience=app_client_id,
        issuer=cognito_issuer
    )

    return payload  # Contains sub, email, cognito:groups
```

**Role-Based Access**:
- Users assigned to Cognito groups (user, admin)
- Groups included in JWT as `cognito:groups`
- Middleware checks groups for admin endpoints

### Infrastructure (AWS CDK)

**VPC Design**:
- 3 subnet types across 2 AZs:
  - Public: NAT Gateway, Bastion (if needed)
  - Private with Egress: ECS tasks, ALB
  - Isolated: Aurora database

**Security**:
- Security groups enforce least privilege:
  - ALB → ECS (port 8000)
  - ECS → Aurora (port 5432)
  - ECS → Bedrock (HTTPS)
- No public access to database or ECS tasks

**Auto-Scaling**:
- ECS service scales on CPU (70%) and memory (80%)
- Aurora Serverless v2 scales ACU based on load
- ALB distributes traffic with health checks

**Observability**:
- CloudWatch Logs for all services
- Container Insights for ECS metrics
- RDS Performance Insights
- Custom CloudWatch dashboards

## Data Flow

### Chat Request Flow

1. **User sends message** via frontend
2. **API Gateway** validates request + WAF rules
3. **ALB** routes to healthy ECS task
4. **FastAPI** validates JWT token
5. **Database** fetches bot config + chat history
6. **Vector Service** (if RAG enabled):
   - Generates query embedding via Bedrock
   - Searches pgvector for similar chunks
   - Adds context to prompt
7. **Bedrock Service** streams response
8. **FastAPI** yields SSE events to client
9. **Database** saves user message + AI response
10. **Frontend** renders streaming response

### RAG Pipeline

```
Document → Chunking → Embedding → Storage → Retrieval
              ↓           ↓          ↓          ↓
           Python      Bedrock   pgvector   Similarity
                       Titan                 Search
```

1. **Document Ingestion**:
   - Split document into chunks (500-1000 tokens)
   - Generate embeddings via Titan
   - Store in PostgreSQL with metadata

2. **Retrieval**:
   - User query → embedding
   - pgvector similarity search
   - Return top-k chunks (k=5)

3. **Augmented Generation**:
   - Inject chunks into prompt
   - Send to Claude with context
   - Stream response

### Multi-Agent Architecture (Future)

```
User Request
     │
     ▼
┌─────────────┐
│Orchestrator │ (Main ECS Service)
└──────┬──────┘
       │
       ├─► SAP Agent (ECS Task)
       ├─► AWS Agent (ECS Task)
       └─► Azure Agent (ECS Task)

Communication: EventBridge or Redis Streams
```

## Security Architecture

### Defense in Depth

1. **WAF (Layer 7)**:
   - Rate limiting
   - Geo-blocking
   - SQL injection protection
   - XSS protection

2. **API Gateway**:
   - Throttling
   - Request validation
   - CORS policies

3. **Application**:
   - JWT validation
   - Input sanitization
   - SQL parameterization
   - Role-based access control

4. **Network**:
   - Private subnets
   - Security groups
   - NACLs
   - VPC Flow Logs

5. **Data**:
   - Encryption at rest (RDS, S3)
   - Encryption in transit (TLS)
   - Secrets Manager for credentials

### Compliance

- GDPR: User data deletion, export
- HIPAA: Encryption, audit logs (if enabled)
- SOC 2: Access controls, monitoring

## Performance Considerations

### Latency Targets

- API response: < 200ms (p95)
- Chat first token: < 1s (p95)
- Database query: < 50ms (p95)
- Vector search: < 100ms (p95)

### Optimization Strategies

1. **Connection Pooling**:
   - SQLAlchemy pool (20 connections)
   - Aurora proxy for connection management

2. **Caching**:
   - Cognito JWKS cached (15 min TTL)
   - Embeddings cached in database
   - Static assets cached in CloudFront

3. **Async Operations**:
   - Non-blocking I/O throughout stack
   - Concurrent database queries
   - Parallel Bedrock requests

4. **Resource Limits**:
   - ECS CPU/memory right-sized
   - Aurora min/max ACU tuned
   - Bedrock max_tokens controlled

## Monitoring and Observability

### Metrics

**Application**:
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Active SSE connections
- Bedrock token usage

**Infrastructure**:
- ECS CPU/memory utilization
- Aurora connections, ACU
- ALB target health
- NAT Gateway data transfer

### Logging

**Log Aggregation**:
- CloudWatch Logs for centralization
- Structured JSON logging
- Correlation IDs for tracing

**Log Levels**:
- ERROR: Application errors, Bedrock failures
- WARN: Rate limits, deprecations
- INFO: Request/response, auth events
- DEBUG: SQL queries, detailed traces

### Alerting

**Critical Alerts**:
- ECS task failures
- Aurora connection pool exhaustion
- Bedrock throttling errors
- WAF block rate spike

**Warning Alerts**:
- High CPU/memory (> 80%)
- Slow queries (> 1s)
- Error rate > 1%

## Disaster Recovery

### Backup Strategy

- **Aurora**: Automated daily snapshots (7-day retention)
- **Application State**: Stored in database (recoverable)
- **Infrastructure**: CDK code in Git (reproducible)

### Recovery Procedures

1. **Database Failure**:
   - Failover to Aurora read replica (automatic)
   - Restore from snapshot (manual, < 1 hour RTO)

2. **ECS Task Failure**:
   - Auto-restart by ECS (seconds)
   - Health checks ensure traffic to healthy tasks

3. **Region Failure**:
   - Deploy CDK stack to new region
   - Restore Aurora from snapshot
   - Update DNS records

### RTO/RPO

- **RTO** (Recovery Time Objective): < 1 hour
- **RPO** (Recovery Point Objective): < 15 minutes (Aurora backup frequency)

## Future Enhancements

1. **Multi-Region**: Active-active deployment across regions
2. **Caching Layer**: Redis/ElastiCache for sessions and embeddings
3. **Event-Driven**: EventBridge for agent communication
4. **Observability**: OpenTelemetry for distributed tracing
5. **CI/CD**: Blue-green deployments with canary releases
