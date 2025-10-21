#!/bin/bash

# Mangoo AI Platform - Deployment Script
# This script deploys the complete stack to AWS

set -e

echo "🚀 Mangoo AI Platform Deployment"
echo "================================="

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "📍 Region: $AWS_REGION"
echo "👤 Account: $AWS_ACCOUNT_ID"
echo ""

# Step 1: Deploy CDK infrastructure
echo "📦 Step 1: Deploying CDK infrastructure..."
cd cdk
npm install
npm run build
cdk deploy --all --require-approval never --outputs-file ../outputs.json
cd ..

echo "✅ Infrastructure deployed"
echo ""

# Extract outputs
USER_POOL_ID=$(jq -r '.MangooStack.UserPoolId' outputs.json)
USER_POOL_CLIENT_ID=$(jq -r '.MangooStack.UserPoolClientId' outputs.json)
DB_ENDPOINT=$(jq -r '.MangooStack.DatabaseEndpoint' outputs.json)
ALB_ENDPOINT=$(jq -r '.MangooStack.ALBEndpoint' outputs.json)

echo "📋 Stack Outputs:"
echo "   User Pool ID: $USER_POOL_ID"
echo "   Client ID: $USER_POOL_CLIENT_ID"
echo "   Database: $DB_ENDPOINT"
echo "   ALB: $ALB_ENDPOINT"
echo ""

# Step 2: Create ECR repositories (if not exist)
echo "📦 Step 2: Creating ECR repositories..."
aws ecr describe-repositories --repository-names mangoo-backend 2>/dev/null || \
  aws ecr create-repository --repository-name mangoo-backend
aws ecr describe-repositories --repository-names mangoo-frontend 2>/dev/null || \
  aws ecr create-repository --repository-name mangoo-frontend

echo "✅ ECR repositories ready"
echo ""

# Step 3: Login to ECR
echo "🔐 Step 3: Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

echo "✅ ECR login successful"
echo ""

# Step 4: Build and push backend
echo "🏗️  Step 4: Building and pushing backend..."
cd backend
docker build --platform linux/amd64 -t ${ECR_REGISTRY}/mangoo-backend:latest .
docker push ${ECR_REGISTRY}/mangoo-backend:latest
cd ..

echo "✅ Backend image pushed"
echo ""

# Step 5: Build and push frontend
echo "🏗️  Step 5: Building and pushing frontend..."
cd frontend
docker build --platform linux/amd64 -t ${ECR_REGISTRY}/mangoo-frontend:latest .
docker push ${ECR_REGISTRY}/mangoo-frontend:latest
cd ..

echo "✅ Frontend image pushed"
echo ""

# Step 6: Update ECS services
echo "🔄 Step 6: Updating ECS services..."
aws ecs update-service \
  --cluster mangoo-cluster \
  --service mangoo-backend-service \
  --force-new-deployment \
  --region $AWS_REGION

echo "✅ ECS service updated"
echo ""

# Step 7: Wait for service stability
echo "⏳ Step 7: Waiting for service to stabilize..."
aws ecs wait services-stable \
  --cluster mangoo-cluster \
  --services mangoo-backend-service \
  --region $AWS_REGION

echo "✅ Service is stable"
echo ""

# Step 8: Health check
echo "🏥 Step 8: Running health check..."
HEALTH_URL="http://${ALB_ENDPOINT}/health"
if curl -f -s $HEALTH_URL > /dev/null; then
  echo "✅ Health check passed"
else
  echo "⚠️  Health check failed - service may still be starting"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Create a user in Cognito: aws cognito-idp admin-create-user --user-pool-id $USER_POOL_ID --username demo --user-attributes Name=email,Value=demo@example.com"
echo "   2. Access the application at: http://${ALB_ENDPOINT}"
echo "   3. Configure your domain and SSL certificate"
echo ""
echo "📚 For more information, see docs/DEPLOYMENT.md"
