# API Reference

Complete API documentation for Mangoo AI Platform.

## Base URL

```
Production: https://api.mangoo.example.com/api/v1
Local: http://localhost:8000/api/v1
```

## Authentication

All endpoints (except health checks) require a valid JWT token from AWS Cognito.

### Header Format

```
Authorization: Bearer <cognito-jwt-token>
```

### Getting a Token

```bash
# Using AWS CLI
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <CLIENT_ID> \
  --auth-parameters USERNAME=<username>,PASSWORD=<password> \
  --query 'AuthenticationResult.IdToken' \
  --output text
```

## Endpoints

### Health Check

#### GET /health

Public endpoint to check API status.

**Response**:
```json
{
  "status": "healthy"
}
```

---

### Users

#### GET /users/me

Get current authenticated user information.

**Response**:
```json
{
  "id": "cognito-sub-uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "full_name": "John Doe",
  "role": "user",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00",
  "last_login": "2024-01-20T15:45:00"
}
```

#### POST /users/register

Register or update user from Cognito token (auto-called after login).

**Response**: Same as GET /users/me

---

### Bots

#### GET /bots

List all accessible bots (owned or public).

**Query Parameters**:
- `include_public` (boolean, default: true): Include public bots
- `marketplace_only` (boolean, default: false): Only marketplace bots

**Response**:
```json
[
  {
    "id": "bot-uuid",
    "name": "My Assistant",
    "description": "A helpful AI assistant",
    "instructions": "You are a helpful assistant...",
    "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "temperature": 70,
    "max_tokens": 4096,
    "rag_enabled": true,
    "knowledge_base_id": "kb-uuid",
    "owner_id": "user-uuid",
    "is_public": false,
    "is_marketplace": false,
    "is_active": true,
    "tags": ["customer-service", "general"],
    "created_at": "2024-01-15T10:30:00",
    "updated_at": "2024-01-20T15:45:00"
  }
]
```

#### GET /bots/{bot_id}

Get details of a specific bot.

**Response**: Single bot object (same structure as list)

#### POST /bots

Create a new bot.

**Request**:
```json
{
  "name": "My Bot",
  "description": "Bot description",
  "instructions": "System prompt for the bot",
  "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "temperature": 70,
  "max_tokens": 4096,
  "rag_enabled": false,
  "knowledge_base_id": null,
  "is_public": false,
  "is_marketplace": false,
  "tags": ["tag1", "tag2"]
}
```

**Response**: Created bot object

#### PATCH /bots/{bot_id}

Update an existing bot (owner only).

**Request**: Partial bot object (only fields to update)

**Response**: Updated bot object

#### DELETE /bots/{bot_id}

Delete a bot (owner only).

**Response**:
```json
{
  "status": "success",
  "id": "bot-uuid"
}
```

---

### Chat

#### POST /chat/stream

Stream chat responses using Server-Sent Events (SSE).

**Request**:
```json
{
  "bot_id": "bot-uuid",
  "message": "Hello, how are you?",
  "chat_id": "optional-chat-uuid",
  "use_rag": false
}
```

**Response** (SSE Stream):

Event: `start`
```json
{
  "chat_id": "chat-uuid",
  "type": "start"
}
```

Event: `message`
```json
{
  "content": "Hello",
  "type": "content"
}
```

Event: `done`
```json
{
  "type": "done",
  "chat_id": "chat-uuid"
}
```

Event: `error`
```json
{
  "error": "Error message",
  "type": "error"
}
```

**Example (curl)**:
```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8000/api/v1/chat/stream \
  -d '{
    "bot_id": "bot-123",
    "message": "Explain quantum computing",
    "use_rag": false
  }'
```

**Example (JavaScript)**:
```javascript
const eventSource = new EventSource('/api/v1/chat/stream', {
  headers: { Authorization: `Bearer ${token}` }
});

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Chunk:', data.content);
});

eventSource.addEventListener('done', () => {
  console.log('Stream complete');
  eventSource.close();
});
```

#### GET /chat/history/{chat_id}

Get conversation history for a chat.

**Response**:
```json
{
  "chat_id": "chat-uuid",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "Hello",
      "created_at": "2024-01-20T15:45:00",
      "model_id": null
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "Hello! How can I help?",
      "created_at": "2024-01-20T15:45:05",
      "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0"
    }
  ]
}
```

#### DELETE /chat/history/{chat_id}

Delete all messages in a conversation.

**Response**:
```json
{
  "status": "success",
  "deleted_count": 10
}
```

---

### Knowledge Base

#### POST /knowledge/add

Add text chunks to a knowledge base for RAG.

**Request**:
```json
{
  "knowledge_base_id": "kb-uuid",
  "texts": [
    "This is chunk 1 of the document...",
    "This is chunk 2 of the document..."
  ],
  "source_type": "pdf",
  "source_uri": "s3://bucket/document.pdf"
}
```

**Response**:
```json
{
  "status": "success",
  "knowledge_base_id": "kb-uuid",
  "chunks_added": 2,
  "chunk_ids": ["chunk-uuid-1", "chunk-uuid-2"]
}
```

#### POST /knowledge/search

Search knowledge base using semantic similarity.

**Request**:
```json
{
  "knowledge_base_id": "kb-uuid",
  "query": "What is machine learning?",
  "top_k": 5
}
```

**Response**:
```json
{
  "status": "success",
  "query": "What is machine learning?",
  "results": [
    {
      "id": "chunk-uuid",
      "text": "Machine learning is a subset of AI...",
      "source_type": "pdf",
      "source_uri": "s3://bucket/ml-guide.pdf",
      "chunk_index": "0",
      "metadata": {},
      "similarity": 0.89
    }
  ]
}
```

#### DELETE /knowledge/{knowledge_base_id}

Delete all chunks from a knowledge base.

**Response**:
```json
{
  "status": "success",
  "knowledge_base_id": "kb-uuid",
  "chunks_deleted": 150
}
```

---

### Agents (Marketplace)

#### GET /agents

List available marketplace agents.

**Query Parameters**:
- `category` (string, optional): Filter by category (sap, aws, azure, general)

**Response**:
```json
[
  {
    "id": "agent-uuid",
    "name": "sap-assistant",
    "display_name": "SAP Expert Assistant",
    "description": "Specialized agent for SAP queries",
    "category": "sap",
    "agent_type": "conversational",
    "capabilities": ["query-sap", "transaction-help", "error-resolution"],
    "status": "active",
    "is_public": true,
    "icon_url": "https://example.com/icons/sap.png",
    "tags": ["sap", "erp", "enterprise"],
    "total_requests": 1234,
    "success_rate": 98
  }
]
```

#### GET /agents/{agent_id}

Get details of a specific agent.

**Response**: Single agent object (same structure as list)

#### POST /agents

Create a new marketplace agent (admin only).

**Request**:
```json
{
  "name": "aws-devops-agent",
  "display_name": "AWS DevOps Expert",
  "description": "Helps with AWS infrastructure and DevOps",
  "category": "aws",
  "agent_type": "task-executor",
  "capabilities": ["cloudformation", "cdk", "troubleshooting"],
  "config": {},
  "is_public": true,
  "icon_url": "https://example.com/icons/aws.png",
  "tags": ["aws", "devops", "infrastructure"]
}
```

**Response**: Created agent object

**Requires**: Admin role (cognito:groups = ["admin"])

#### GET /agents/categories/list

Get list of all agent categories.

**Response**:
```json
{
  "categories": ["sap", "aws", "azure", "general"]
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "detail": "Validation error: field 'name' is required"
}
```

### 401 Unauthorized

```json
{
  "detail": "Invalid token: token has expired"
}
```

### 403 Forbidden

```json
{
  "detail": "Access denied"
}
```

### 404 Not Found

```json
{
  "detail": "Bot not found"
}
```

### 500 Internal Server Error

```json
{
  "detail": "Bedrock inference error: throttling"
}
```

---

## Rate Limits

- **Per IP**: 2000 requests per 5 minutes (WAF enforced)
- **Per User**: No hard limit (monitor via CloudWatch)
- **Bedrock**: Subject to AWS service quotas

## Pagination

Currently not implemented. Future versions will support:

```
GET /bots?page=1&limit=20
```

## Versioning

API version is in the URL path: `/api/v1/`

Breaking changes will increment the version number.

## WebSocket Support

Not currently supported. SSE is used for streaming responses.

Future versions may include WebSocket support for:
- Bidirectional communication
- Real-time notifications
- Multi-agent orchestration

## SDK Examples

### Python

```python
import httpx

class MangooClient:
    def __init__(self, api_url: str, token: str):
        self.base_url = api_url
        self.headers = {"Authorization": f"Bearer {token}"}

    async def list_bots(self):
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/bots",
                headers=self.headers
            )
            return response.json()

    async def stream_chat(self, bot_id: str, message: str):
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/stream",
                headers=self.headers,
                json={"bot_id": bot_id, "message": message}
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield json.loads(line[6:])
```

### JavaScript/TypeScript

```typescript
class MangooClient {
  constructor(private apiUrl: string, private token: string) {}

  async listBots() {
    const response = await fetch(`${this.apiUrl}/bots`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return response.json();
  }

  streamChat(botId: string, message: string, onChunk: (data: any) => void) {
    const eventSource = new EventSource(
      `${this.apiUrl}/chat/stream`,
      {
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );

    eventSource.addEventListener('message', (event) => {
      onChunk(JSON.parse(event.data));
    });

    return eventSource;
  }
}
```

## Best Practices

1. **Token Management**: Cache Cognito tokens and refresh before expiry
2. **Error Handling**: Always handle 401/403 and redirect to login
3. **SSE Reconnection**: Implement exponential backoff for reconnections
4. **Rate Limiting**: Implement client-side rate limiting
5. **Timeouts**: Set appropriate timeouts for long-running requests
6. **Retries**: Implement retry logic with exponential backoff for 5xx errors
