# SSE Streaming Configuration Guide

This document explains how Server-Sent Events (SSE) streaming is configured in Mangoo AI Platform for real-time chat responses from Amazon Bedrock.

## Architecture Overview

```
Frontend (EventSource)
    ↓ HTTPS
API Gateway (HTTP API)
    ↓ VPC Link
Application Load Balancer (120s idle timeout)
    ↓ HTTP
ECS Fargate Task (Uvicorn direct)
    ↓ Bedrock API
Amazon Bedrock (Claude 3.5 Sonnet)
```

## Key Configuration Points

### 1. Backend (FastAPI + Uvicorn)

**No NGINX in the container** - Uvicorn runs directly to avoid buffering issues.

#### Uvicorn Configuration

The backend container starts with:

```bash
uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --proxy-headers \
    --forwarded-allow-ips "*"
```

**Critical Flags**:
- `--proxy-headers`: Trust `X-Forwarded-*` headers from ALB
- `--forwarded-allow-ips="*"`: Accept forwarded headers from any proxy (ALB)
- No `--workers` flag: Single worker to maintain streaming state

#### SSE Response Headers

```python
return StreamingResponse(
    event_generator(),
    media_type="text/event-stream",
    headers={
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "Transfer-Encoding": "chunked",
    }
)
```

**Why these headers?**
- `Cache-Control: no-cache`: Prevent any caching of the stream
- `X-Accel-Buffering: no`: Disable buffering (if NGINX added later)
- `Connection: keep-alive`: Maintain persistent connection
- `Transfer-Encoding: chunked`: Enable chunk-based transmission

### 2. Application Load Balancer

**Critical Configuration**: ALB must keep connections open for streaming.

```typescript
const alb = new elbv2.ApplicationLoadBalancer(this, 'MangooALB', {
  vpc,
  internetFacing: false,
  idleTimeout: cdk.Duration.seconds(120),  // CRITICAL for SSE
});
```

**Why 120 seconds?**
- Default ALB timeout is 60s
- Bedrock can take 30-60s to generate responses
- Need buffer time for network latency
- 120s provides safe margin for long responses

**Target Group Settings**:
```typescript
const targetGroup = listener.addTargets('BackendTarget', {
  port: 8000,
  protocol: elbv2.ApplicationProtocol.HTTP,
  targets: [backendService],
  deregistrationDelay: cdk.Duration.seconds(30),
  stickinessCookieDuration: cdk.Duration.hours(1),
});
```

**Stickiness enabled**: Ensures the same client always hits the same backend task during a conversation.

### 3. API Gateway

**HTTP API** (not REST API) is used for better WebSocket/streaming support.

```typescript
const api = new apigatewayv2.HttpApi(this, 'MangooAPI', {
  apiName: 'mangoo-api',
  // VPC Link integration with ALB
});
```

**Why HTTP API?**
- Lower latency than REST API
- Better suited for streaming responses
- Simpler integration with VPC Link
- Lower cost ($1/million vs $3.50/million)

### 4. Bedrock Streaming

```python
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
            delta = event["contentBlockDelta"]["delta"]
            if "text" in delta:
                yield delta["text"]  # Yield immediately, no buffering
```

**Key Points**:
- Use `converse_stream()` (not legacy `invoke_model_with_response_stream()`)
- Yield chunks immediately as they arrive
- No accumulation or buffering on backend

## SSE Event Format

### Start Event
```
event: start
data: {"chat_id": "chat-123", "type": "start"}

```

### Content Events (multiple)
```
event: message
data: {"content": "Hello", "type": "content"}

event: message
data: {"content": " world", "type": "content"}

```

### Done Event
```
event: done
data: {"type": "done", "chat_id": "chat-123"}

```

### Error Event
```
event: error
data: {"error": "Error message", "type": "error"}

```

**Important**: Each event ends with two newlines (`\n\n`)

## Frontend (EventSource)

```typescript
const eventSource = new EventSource('/api/v1/chat/stream', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.content) {
    setResponse(prev => prev + data.content);
  }
});

eventSource.addEventListener('done', () => {
  eventSource.close();
});

eventSource.addEventListener('error', (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
});
```

## Troubleshooting SSE

### Problem: Stream cuts off after 60 seconds

**Cause**: ALB idle timeout too low

**Solution**: Verify CDK stack has `idleTimeout: cdk.Duration.seconds(120)`

```bash
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn <alb-arn> \
  | grep idle_timeout
```

### Problem: Response buffered, arrives all at once

**Cause**: Buffering middleware or reverse proxy

**Solution**:
- Verify no NGINX in backend container
- Check Uvicorn starts with `--proxy-headers`
- Ensure response headers include `Cache-Control: no-cache`

### Problem: CORS errors on SSE endpoint

**Cause**: Missing CORS headers for EventSource

**Solution**: Verify FastAPI CORS middleware:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],  # Important for SSE
)
```

### Problem: 401 Unauthorized on SSE

**Cause**: EventSource doesn't support custom headers in all browsers

**Solution**: Pass token as query parameter (if needed):

```typescript
const eventSource = new EventSource(
  `/api/v1/chat/stream?token=${token}`
);
```

Then validate in backend:
```python
@router.post("/stream")
async def chat_stream(
    request: Request,
    token: str = Query(None),
    user_id: str = Depends(get_current_user_id)
):
    # Validate token from query if needed
    ...
```

## Testing SSE Locally

### Using curl

```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8000/api/v1/chat/stream \
  -d '{
    "bot_id": "bot-123",
    "message": "Explain quantum computing in 3 sentences"
  }'
```

**Expected output**:
```
event: start
data: {"chat_id":"chat-xxx","type":"start"}

event: message
data: {"content":"Quantum","type":"content"}

event: message
data: {"content":" computing","type":"content"}

...

event: done
data: {"type":"done","chat_id":"chat-xxx"}
```

### Using Python

```python
import httpx

async def test_sse():
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "http://localhost:8000/api/v1/chat/stream",
            headers={"Authorization": f"Bearer {token}"},
            json={"bot_id": "bot-123", "message": "Hello"}
        ) as response:
            async for line in response.aiter_lines():
                print(line)

import asyncio
asyncio.run(test_sse())
```

## Performance Optimization

### 1. Connection Pooling

ECS tasks maintain persistent connections to Bedrock to reduce latency:

```python
# Bedrock client created once per container
bedrock_client = boto3.client(
    "bedrock-runtime",
    region_name=settings.BEDROCK_REGION
)
```

### 2. ECS Task Scaling

Configure auto-scaling to handle concurrent SSE connections:

```typescript
backendScaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
});
```

### 3. ALB Connection Draining

Set appropriate deregistration delay to allow in-flight SSE streams to complete:

```typescript
deregistrationDelay: cdk.Duration.seconds(30),
```

## Monitoring SSE

### CloudWatch Metrics

Monitor these metrics:
- **ECS CPU**: Should remain < 70% during streaming
- **ALB Active Connections**: Track concurrent SSE connections
- **ALB Target Response Time**: Should be < 1s for first byte
- **Bedrock InvokeModel Duration**: Track Bedrock latency

### CloudWatch Logs

Look for these patterns:

**Successful stream**:
```
INFO: 127.0.0.1:12345 - "POST /api/v1/chat/stream HTTP/1.1" 200 OK
```

**Stream error**:
```
ERROR: SSE stream error: [error message]
```

## Security Considerations

### 1. Token Validation

Always validate JWT tokens before starting SSE stream:

```python
async def chat_stream(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),  # Validates JWT
    db: AsyncSession = Depends(get_db)
):
    ...
```

### 2. Rate Limiting

Implement rate limiting at API Gateway level:

```typescript
const throttle = new apigatewayv2.ThrottleSettings({
  rateLimit: 100,
  burstLimit: 200,
});
```

### 3. WAF Rules

WAF should allow long connections but still protect against abuse:

```typescript
{
  name: 'RateLimitRule',
  priority: 1,
  action: { block: {} },
  statement: {
    rateBasedStatement: {
      limit: 2000,  // Allow many requests for SSE
      aggregateKeyType: 'IP',
    },
  },
}
```

## Best Practices

1. **Always close EventSource**: Prevent memory leaks in frontend
2. **Handle reconnection**: Implement exponential backoff for retries
3. **Timeout handling**: Close connection if no data for > 60s
4. **Error boundaries**: Wrap SSE components in error boundaries
5. **Loading states**: Show loading indicator while waiting for first chunk
6. **Message deduplication**: Use message IDs to avoid duplicate rendering

## Common Pitfalls

❌ **Don't use multiple workers**: SSE state is not shared between workers
❌ **Don't buffer chunks**: Yield immediately from Bedrock stream
❌ **Don't forget idle timeout**: ALB will close connection after 60s by default
❌ **Don't use REST API**: HTTP API has better streaming support
❌ **Don't add NGINX**: Adds unnecessary buffering layer

✅ **Do use single Uvicorn worker**
✅ **Do yield chunks immediately**
✅ **Do set ALB timeout to 120s**
✅ **Do use HTTP API**
✅ **Do run Uvicorn directly**

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [FastAPI Streaming Response](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)
- [AWS ALB Idle Timeout](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#connection-idle-timeout)
- [Amazon Bedrock Streaming](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_InvokeModelWithResponseStream_section.html)
