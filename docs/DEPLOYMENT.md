# Deployment Guide

Complete guide for deploying Mangoo AI Platform to AWS.

## Prerequisites Checklist

- [ ] AWS account with admin access
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] Node.js 20+ installed
- [ ] Python 3.11+ installed
- [ ] Docker installed
- [ ] CDK CLI installed (`npm install -g aws-cdk`)
- [ ] Bedrock model access enabled

## Step 1: Enable Bedrock Models

### Request Model Access

1. Navigate to AWS Console → Amazon Bedrock → Model access
2. Request access to:
   - Anthropic Claude 3.5 Sonnet v2
   - Amazon Titan Embeddings Text v2

### Verify Access

```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query 'modelSummaries[?contains(modelId, `claude-3-5`) || contains(modelId, `titan-embed`)].modelId'
```

Expected output should include:
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `amazon.titan-embed-text-v2:0`

## Step 2: Bootstrap CDK

First time only:

```bash
cd cdk
npm install

# Bootstrap CDK in your account/region
cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

## Step 3: Deploy Infrastructure

### Configure CDK Context

Edit `cdk/cdk.json` to set your preferences:

```json
{
  "context": {
    "environment": "production",
    "domain": "example.com"
  }
}
```

### Deploy Stack

```bash
cd cdk
npm run build
cdk deploy --all

# Save outputs
cdk deploy --all --outputs-file ../outputs.json
```

This will create:
- VPC with public/private/isolated subnets
- Aurora PostgreSQL Serverless v2 cluster
- ECS Fargate cluster
- Cognito User Pool
- Application Load Balancer
- Security groups and IAM roles

**Deployment time**: ~15-20 minutes

### Retrieve Outputs

```bash
cat ../outputs.json
```

Note these values:
- `UserPoolId`
- `UserPoolClientId`
- `DatabaseEndpoint`
- `ALBEndpoint`
- `DatabaseSecretArn`

## Step 4: Initialize Database

### Get Database Password

```bash
aws secretsmanager get-secret-value \
  --secret-id <DatabaseSecretArn> \
  --query SecretString \
  --output text | jq -r .password
```

### Connect and Initialize

```bash
# Connect via bastion or ECS Exec
aws ecs execute-command \
  --cluster mangoo-cluster \
  --task <task-id> \
  --container backend \
  --interactive \
  --command "/bin/bash"

# Inside container
python -c "
from app.core.database import init_db
import asyncio
asyncio.run(init_db())
"
```

Verify pgvector:

```bash
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

## Step 5: Create ECR Repositories

```bash
aws ecr create-repository --repository-name mangoo-backend
aws ecr create-repository --repository-name mangoo-frontend

# Get ECR URI
aws ecr describe-repositories \
  --repository-names mangoo-backend mangoo-frontend \
  --query 'repositories[].repositoryUri'
```

## Step 6: Build and Push Images

### Login to ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ECR_REGISTRY>
```

### Build Backend

```bash
cd backend

# Create optimized production image
docker build \
  --platform linux/amd64 \
  -t <ECR_REGISTRY>/mangoo-backend:latest \
  -t <ECR_REGISTRY>/mangoo-backend:v1.0.0 \
  .

docker push <ECR_REGISTRY>/mangoo-backend:latest
docker push <ECR_REGISTRY>/mangoo-backend:v1.0.0
```

### Build Frontend

```bash
cd frontend

# Build with production config
docker build \
  --platform linux/amd64 \
  --build-arg VITE_API_URL=<API_GATEWAY_URL> \
  -t <ECR_REGISTRY>/mangoo-frontend:latest \
  -t <ECR_REGISTRY>/mangoo-frontend:v1.0.0 \
  .

docker push <ECR_REGISTRY>/mangoo-frontend:latest
docker push <ECR_REGISTRY>/mangoo-frontend:v1.0.0
```

## Step 7: Update ECS Task Definitions

### Update Backend Task

The CDK stack creates the task definition, but you may need to update environment variables:

```bash
aws ecs describe-task-definition \
  --task-definition mangoo-backend \
  --query 'taskDefinition.taskDefinitionArn'

# Register new revision with updated env vars
aws ecs register-task-definition \
  --cli-input-json file://backend-task-def.json
```

### Force New Deployment

```bash
aws ecs update-service \
  --cluster mangoo-cluster \
  --service mangoo-backend-service \
  --force-new-deployment
```

## Step 8: Configure DNS and SSL

### Create ACM Certificate

```bash
aws acm request-certificate \
  --domain-name api.example.com \
  --domain-name www.example.com \
  --validation-method DNS \
  --region us-east-1
```

### Update Route 53

```bash
# Create A record for ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id <ZONE_ID> \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "<ALB_ZONE_ID>",
          "DNSName": "<ALB_DNS>",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

## Step 9: Configure API Gateway

The CDK stack creates the HTTP API. Update the integration:

```bash
# Get API ID
aws apigatewayv2 get-apis \
  --query 'Items[?Name==`Mangoo API`].ApiId'

# Update integration
aws apigatewayv2 update-integration \
  --api-id <API_ID> \
  --integration-id <INTEGRATION_ID> \
  --integration-uri <ALB_LISTENER_ARN>
```

## Step 10: Create Cognito Test User

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username admin \
  --user-attributes \
    Name=email,Value=admin@example.com \
    Name=email_verified,Value=true \
  --temporary-password "TempPass123!"

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username admin \
  --password "SecurePass123!" \
  --permanent
```

## Step 11: Deploy Frontend to S3/CloudFront

### Create S3 Bucket

```bash
aws s3 mb s3://mangoo-frontend-<account-id>
aws s3 website s3://mangoo-frontend-<account-id> \
  --index-document index.html \
  --error-document index.html
```

### Build and Upload

```bash
cd frontend
npm run build

aws s3 sync dist/ s3://mangoo-frontend-<account-id>/ \
  --delete \
  --cache-control "public,max-age=31536000,immutable"
```

### Create CloudFront Distribution

```bash
# Use CDK or CloudFormation to create distribution
# Point origin to S3 bucket
# Add custom domain with ACM certificate
```

## Step 12: Verify Deployment

### Health Checks

```bash
# Backend health
curl https://api.example.com/health

# API Gateway
curl https://api.example.com/api/v1/

# Frontend
curl https://www.example.com
```

### Test Authentication

```bash
# Get token
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <CLIENT_ID> \
  --auth-parameters \
    USERNAME=admin,PASSWORD=SecurePass123! \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# Test authenticated endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/users/me
```

### Test SSE Streaming

```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST https://api.example.com/api/v1/chat/stream \
  -d '{"bot_id":"<bot-id>","message":"Hello, world!"}'
```

## Post-Deployment Configuration

### Enable CloudWatch Alarms

```bash
# CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name mangoo-backend-cpu-high \
  --alarm-description "Backend CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### Configure WAF Rules

```bash
# Already configured in CDK stack
# Additional rules can be added via Console or CLI
```

### Set Up Backup

Aurora automatic backups are configured in CDK (7 days retention).

For point-in-time recovery:

```bash
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier mangoo-database \
  --db-cluster-snapshot-identifier mangoo-manual-backup-$(date +%Y%m%d)
```

## Monitoring Setup

### CloudWatch Dashboard

```bash
aws cloudwatch put-dashboard \
  --dashboard-name Mangoo \
  --dashboard-body file://cloudwatch-dashboard.json
```

### Enable Container Insights

Already enabled in CDK stack. View metrics:

```bash
aws logs tail /aws/ecs/containerinsights/mangoo-cluster/performance --follow
```

## Rollback Procedure

### Rollback ECS Service

```bash
# Get previous task definition
aws ecs describe-services \
  --cluster mangoo-cluster \
  --services mangoo-backend-service \
  --query 'services[0].deployments'

# Update to previous revision
aws ecs update-service \
  --cluster mangoo-cluster \
  --service mangoo-backend-service \
  --task-definition mangoo-backend:N  # previous revision
```

### Rollback CDK Stack

```bash
cd cdk
git checkout <previous-commit>
cdk deploy --all
```

## Troubleshooting

### ECS Tasks Not Starting

```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster mangoo-cluster \
  --tasks <task-arn> \
  --query 'tasks[0].stoppedReason'

# Check logs
aws logs tail /aws/ecs/mangoo-backend --follow
```

### Database Connection Timeout

```bash
# Verify security groups
aws ec2 describe-security-groups \
  --group-ids <db-sg-id> \
  --query 'SecurityGroups[0].IpPermissions'

# Test from ECS task
aws ecs execute-command \
  --cluster mangoo-cluster \
  --task <task-id> \
  --container backend \
  --interactive \
  --command "nc -zv <db-endpoint> 5432"
```

### Bedrock Throttling

```bash
# Check service quotas
aws service-quotas get-service-quota \
  --service-code bedrock \
  --quota-code <quota-code>

# Request increase via Console
```

## Cost Monitoring

### Enable Cost Allocation Tags

```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Project
```

### Set Budget Alert

```bash
aws budgets create-budget \
  --account-id <account-id> \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

## Security Hardening

1. Enable GuardDuty
2. Enable Security Hub
3. Enable AWS Config rules
4. Rotate secrets regularly
5. Review IAM policies quarterly
6. Enable VPC Flow Logs
7. Use AWS Organizations SCPs

## Maintenance Windows

Schedule maintenance:

```bash
# Stop services
aws ecs update-service \
  --cluster mangoo-cluster \
  --service mangoo-backend-service \
  --desired-count 0

# Perform maintenance
# ...

# Start services
aws ecs update-service \
  --cluster mangoo-cluster \
  --service mangoo-backend-service \
  --desired-count 2
```

## Disaster Recovery

### Backup Procedure

1. Aurora automated snapshots (daily)
2. Manual snapshots before major changes
3. Export configuration to S3
4. Document all manual changes

### Recovery Procedure

1. Restore Aurora from snapshot
2. Redeploy CDK stack
3. Push Docker images
4. Update ECS services
5. Verify health checks

## Support

For deployment issues:
- Check CloudWatch Logs
- Review CDK stack events
- Consult AWS documentation
- Open GitHub issue
