# Mangoo AI Platform

A modern multi-agent AI platform built on AWS, featuring conversational AI, RAG (Retrieval-Augmented Generation), and an agent marketplace.

## Architecture Overview

Mangoo is a scalable, serverless-first platform that combines:

- **Backend**: FastAPI + Uvicorn (direct, no NGINX) on ECS Fargate
- **Database**: Aurora PostgreSQL Serverless v2 with pgvector extension
- **AI**: Amazon Bedrock (Claude, Titan Embeddings)
- **Auth**: Amazon Cognito
- **Frontend**: React + Tailwind CSS + Vite
- **Infrastructure**: AWS CDK (TypeScript)
- **Load Balancing**: Application Load Balancer with 120s idle timeout for SSE
- **CI/CD**: AWS CodeBuild (native AWS integration, no static credentials)

### Key Features

- Real-time chat with streaming responses (SSE)
- Custom bot creation and management
- RAG using pgvector for semantic search
- Multi-agent marketplace architecture
- JWT-based authentication via Cognito
- Auto-scaling ECS services
- WAF protection
- CloudWatch monitoring

## Project Structure

```
mangoo/
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── api/routes/   # API endpoints
│   │   ├── core/         # Config and database
│   │   ├── models/       # SQLAlchemy models
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Auth middleware
│   │   └── main.py       # App entry point
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # React application
│   ├── src/
│   │   ├── pages/        # React pages
│   │   ├── services/     # API clients
│   │   ├── stores/       # Zustand state
│   │   └── components/   # Reusable components
│   ├── Dockerfile
│   └── package.json
├── cdk/                   # Infrastructure as Code
│   ├── lib/
│   │   └── mangoo-stack.ts
│   └── bin/cdk.ts
├── docs/                  # Additional documentation
├── buildspec.yml          # AWS CodeBuild specification
└── docker-compose.yml     # Local development
```

## Prerequisites

- **AWS Account** with Bedrock access
- **AWS CLI** configured
- **Node.js** 20+
- **Python** 3.11+
- **Docker** and Docker Compose
- **CDK CLI**: `npm install -g aws-cdk`

## Quick Start (Local Development)

### 1. Clone and Configure

```bash
git clone <repository-url>
cd mangoo

# Backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your AWS credentials

# Frontend environment
cp frontend/.env.example frontend/.env
# Edit frontend/.env
```

### 2. Start Local Stack

```bash
# Start PostgreSQL + Backend + Frontend
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

### 3. Initialize Database

```bash
# Connect to backend container
docker-compose exec backend python

# In Python shell:
from app.core.database import init_db
import asyncio
asyncio.run(init_db())
```

### 4. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## AWS Deployment

### Step 1: Enable Amazon Bedrock Models

```bash
# Enable required models in your AWS region
aws bedrock list-foundation-models --region us-east-1

# Request access to:
# - anthropic.claude-3-5-sonnet-20241022-v2:0
# - amazon.titan-embed-text-v2:0
```

### Step 2: Deploy Infrastructure with CDK

```bash
cd cdk

# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/us-east-1

# Deploy stack
cdk deploy

# Note the outputs:
# - UserPoolId
# - UserPoolClientId
# - DatabaseEndpoint
# - ALBEndpoint
```

### Step 3: Update Environment Variables

Update your `.env` files with the CDK outputs:

```bash
# backend/.env
DATABASE_URL=postgresql://postgres:PASSWORD@<DatabaseEndpoint>:5432/mangoo
COGNITO_USER_POOL_ID=<UserPoolId>
COGNITO_APP_CLIENT_ID=<UserPoolClientId>

# frontend/.env
VITE_API_URL=https://<API-Gateway-URL>
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
```

### Step 4: Build and Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR-REGISTRY>

# Build and push backend
cd backend
docker build -t <ECR-REGISTRY>/mangoo-backend:latest .
docker push <ECR-REGISTRY>/mangoo-backend:latest

# Build and push frontend
cd ../frontend
docker build -t <ECR-REGISTRY>/mangoo-frontend:latest .
docker push <ECR-REGISTRY>/mangoo-frontend:latest
```

### Step 5: Set Up CI/CD with CodeBuild

Deploy the CodeBuild project:

```bash
cd cdk
cdk deploy MangooCodeBuildStack
```

This creates:
- CodeBuild project: `mangoo-build-deploy`
- S3 bucket for artifacts
- CloudWatch log group
- GitHub webhook (automatic triggers on push to main)

### Step 6: Trigger First Build

Push code to GitHub to trigger automatic build:

```bash
git push origin main
```

Or trigger manually:

```bash
aws codebuild start-build --project-name mangoo-build-deploy
```

Monitor the build:

```bash
# View logs in real-time
aws logs tail /aws/codebuild/mangoo --follow

# Check build status
aws codebuild list-builds-for-project --project-name mangoo-build-deploy
```

The CodeBuild pipeline will:
1. Build backend and frontend Docker images
2. Push images to ECR
3. Deploy CDK stacks
4. Update ECS services automatically

## Configuration

### Backend Configuration

Key environment variables in `backend/.env`:

```bash
# Application
APP_NAME=Mangoo AI Platform
DEBUG=false

# Database
DATABASE_URL=postgresql://user:pass@host:5432/mangoo

# AWS Cognito
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_APP_CLIENT_ID=xxxxxxxxxx
COGNITO_REGION=us-east-1

# AWS Bedrock
BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0

# Security
SECRET_KEY=<generate-strong-key>
```

### Frontend Configuration

Key environment variables in `frontend/.env`:

```bash
VITE_API_URL=https://api.example.com
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
```

## API Documentation

### Authentication

All API endpoints require a JWT token from Cognito:

```bash
Authorization: Bearer <cognito-jwt-token>
```

### Key Endpoints

#### Chat (SSE Streaming)

```bash
POST /api/v1/chat/stream
Content-Type: application/json

{
  "bot_id": "bot-uuid",
  "message": "Hello!",
  "chat_id": "optional-chat-id",
  "use_rag": false
}
```

#### Bots Management

```bash
# List bots
GET /api/v1/bots

# Create bot
POST /api/v1/bots
{
  "name": "My Bot",
  "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "temperature": 70,
  "rag_enabled": true
}

# Update bot
PATCH /api/v1/bots/{bot_id}

# Delete bot
DELETE /api/v1/bots/{bot_id}
```

#### Knowledge Base (RAG)

```bash
# Add knowledge
POST /api/v1/knowledge/add
{
  "knowledge_base_id": "kb-uuid",
  "texts": ["Document chunk 1", "Document chunk 2"],
  "source_type": "pdf"
}

# Search knowledge
POST /api/v1/knowledge/search
{
  "knowledge_base_id": "kb-uuid",
  "query": "What is pgvector?",
  "top_k": 5
}
```

#### Marketplace Agents

```bash
# List agents
GET /api/v1/agents?category=sap

# Get agent details
GET /api/v1/agents/{agent_id}
```

## Database Schema

### Users
- `id` (PK): Cognito sub UUID
- `email`: User email
- `username`: Username
- `role`: user | admin

### Bots
- `id` (PK): UUID
- `name`: Bot name
- `model_id`: Bedrock model ID
- `instructions`: System prompt
- `rag_enabled`: Boolean
- `owner_id` (FK): User ID

### Messages
- `id` (PK): UUID
- `chat_id`: Conversation UUID
- `role`: user | assistant
- `content`: Message text
- `bot_id` (FK): Bot ID
- `user_id` (FK): User ID

### Knowledge Chunks
- `id` (PK): UUID
- `knowledge_base_id`: KB identifier
- `text`: Chunk content
- `embedding`: vector(1024) - pgvector
- `metadata`: JSONB

### Agents
- `id` (PK): UUID
- `name`: Agent identifier
- `category`: sap | aws | azure | general
- `status`: active | inactive

## Cost Optimization

Expected monthly costs (low traffic):

- **ECS Fargate**: ~$30 (2 tasks × 0.5 vCPU, 1 GB)
- **Aurora Serverless v2**: ~$15 (0.5-2 ACU)
- **NAT Gateway**: ~$32
- **ALB**: ~$20
- **API Gateway**: ~$3
- **Cognito**: Free tier (50k MAU)
- **Bedrock**: Pay per token

**Total**: ~$50-100/month

### Optimization Tips

1. Use Aurora Serverless v2 with min ACU = 0.5
2. Scale down ECS tasks during off-hours
3. Use CloudWatch to monitor Bedrock token usage
4. Enable S3 caching for embeddings
5. Consider Reserved Instances for predictable load

## Monitoring and Logs

### CloudWatch Dashboards

```bash
aws cloudwatch get-dashboard --dashboard-name MangooMetrics
```

### Key Metrics to Monitor

- ECS CPU/Memory utilization
- Aurora connections and ACU usage
- API Gateway request count and latency
- Bedrock token consumption
- WAF blocked requests

### Logs

```bash
# Backend logs
aws logs tail /aws/ecs/mangoo-backend --follow

# Database logs
aws logs tail /aws/rds/cluster/mangoo-database/postgresql --follow
```

## Testing

### Backend Tests

```bash
cd backend
pip install pytest pytest-asyncio pytest-cov
pytest tests/ --cov=app
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Integration Tests

```bash
# Test SSE streaming
curl -N -H "Authorization: Bearer $TOKEN" \
  -X POST http://localhost:8000/api/v1/chat/stream \
  -d '{"bot_id":"xxx","message":"Hello"}'
```

## Security Best Practices

1. **Secrets Management**: Use AWS Secrets Manager for sensitive data
2. **IAM Roles**: Least privilege for ECS tasks
3. **WAF**: Enable rate limiting and geo-blocking
4. **Cognito**: Enforce strong password policies
5. **Network**: Private subnets for database and backend
6. **Encryption**: Enable at-rest encryption for RDS and S3

## Troubleshooting

### Database Connection Issues

```bash
# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxx

# Test connection from ECS task
aws ecs execute-command --cluster mangoo-cluster --task <task-id> \
  --command "psql $DATABASE_URL -c 'SELECT 1'"
```

### SSE Not Streaming

- Check ALB idle timeout (must be ≥ 120s in CDK stack)
- Verify Uvicorn is running with `--proxy-headers` flag
- Ensure no buffering middleware between ALB and ECS
- Check CloudWatch logs for errors
- Test SSE endpoint directly: `curl -N http://alb-endpoint/api/v1/chat/stream`

### Bedrock Access Denied

```bash
# Verify model access
aws bedrock list-foundation-models --region us-east-1

# Check IAM role permissions
aws iam get-role-policy --role-name MangooBackendTaskRole --policy-name BedrockAccess
```

## Roadmap

### Phase 1 (Current)
- ✅ Basic chat with SSE
- ✅ Bot management
- ✅ RAG with pgvector
- ✅ Cognito authentication
- ✅ ECS deployment

### Phase 2 (Next)
- [ ] Specialized agents (SAP, AWS, Azure DevOps)
- [ ] EventBridge for agent communication
- [ ] Agent marketplace UI
- [ ] Usage analytics and billing
- [ ] Multi-tenant support

### Phase 3 (Future)
- [ ] Agent workflow orchestration
- [ ] Custom model fine-tuning
- [ ] Multi-region deployment
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: `/docs`

## Acknowledgments

Inspired by:
- [aws-samples/bedrock-chat](https://github.com/aws-samples/bedrock-chat)
- AWS Bedrock documentation
- FastAPI best practices
- React + Vite ecosystem
