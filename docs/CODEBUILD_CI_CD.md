# AWS CodeBuild CI/CD Guide

Complete guide for the AWS CodeBuild-based CI/CD pipeline for Mangoo AI Platform.

## Overview

Mangoo uses **AWS CodeBuild** for continuous integration and deployment, eliminating the need for GitHub Actions or static credentials. The pipeline automatically builds, tests, and deploys the application on every push to the main branch.

## Architecture

```
GitHub Repository (jhonmezaa/mangoo)
    ↓ Webhook on Push
AWS CodeBuild Project
    ├── Phase 1: Install
    │   ├── Node.js 20, Python 3.11, Docker
    │   ├── CDK CLI, npm packages, pip packages
    ├── Phase 2: Pre-Build
    │   ├── Login to ECR (temporary credentials)
    │   ├── Create ECR repositories if needed
    ├── Phase 3: Build
    │   ├── Build backend Docker image
    │   ├── Build frontend (React + Vite)
    │   ├── Build frontend Docker image
    ├── Phase 4: Post-Build
    │   ├── Push images to ECR
    │   ├── Deploy CDK stacks
    │   └── Force ECS service update
    ↓
Artifacts → S3 Bucket
Logs → CloudWatch Logs
Deployment → ECS Fargate, Aurora, etc.
```

## Features

- ✅ **Automated Builds**: Triggers on every push to main branch
- ✅ **Temporary Credentials**: Uses IAM role, no static Access Keys
- ✅ **Docker Builds**: Multi-stage builds for backend and frontend
- ✅ **CDK Deployment**: Infrastructure as code with full automation
- ✅ **Artifact Storage**: Build outputs saved to S3
- ✅ **CloudWatch Logs**: Comprehensive build logging
- ✅ **Cache Support**: Docker layer and dependency caching
- ✅ **Security Scanning**: ECR image scanning enabled

## Project Structure

```
mangoo/
├── buildspec.yml              # CodeBuild build specification
├── cdk/
│   └── lib/
│       └── codebuild-stack.ts # CodeBuild infrastructure
└── docs/
    └── CODEBUILD_CI_CD.md     # This file
```

## Buildspec Phases

### 1. Install Phase

```yaml
install:
  runtime-versions:
    nodejs: 20
    python: 3.11
    docker: 20
  commands:
    - npm install -g aws-cdk@latest
    - pip install -r backend/requirements.txt
    - npm ci (in cdk/ and frontend/)
```

**Purpose**: Install all required tools and dependencies.

**Duration**: ~2-3 minutes (cached: ~30 seconds)

### 2. Pre-Build Phase

```yaml
pre_build:
  commands:
    - Get AWS account ID and region
    - Generate IMAGE_TAG from commit hash
    - Login to ECR (temporary credentials)
    - Create ECR repositories if needed
```

**Purpose**: Prepare environment and authenticate to AWS services.

**Duration**: ~30 seconds

### 3. Build Phase

```yaml
build:
  commands:
    - Build backend Docker image (FastAPI)
    - Build frontend (npm run build)
    - Build frontend Docker image (nginx)
    - Tag images with commit hash and 'latest'
```

**Purpose**: Build all application components.

**Duration**: ~5-7 minutes (with cache: ~2-3 minutes)

### 4. Post-Build Phase

```yaml
post_build:
  commands:
    - Push backend image to ECR
    - Push frontend image to ECR
    - Deploy CDK stacks
    - Update ECS service (force new deployment)
    - Output deployment summary
```

**Purpose**: Deploy application to AWS infrastructure.

**Duration**: ~10-15 minutes (CDK deployment)

**Total Pipeline Duration**: ~15-20 minutes

## IAM Permissions

The CodeBuild project uses a service role with the following permissions:

### Required Permissions

```typescript
// ECR - Push and pull images
ecr:*

// ECS - Update services and task definitions
ecs:UpdateService
ecs:DescribeServices
ecs:RegisterTaskDefinition

// CloudFormation - Deploy CDK stacks
cloudformation:CreateStack
cloudformation:UpdateStack
cloudformation:DescribeStacks

// IAM - Create roles for ECS tasks
iam:CreateRole
iam:PassRole
iam:AttachRolePolicy

// VPC - Create network resources
ec2:CreateVpc
ec2:CreateSubnet
ec2:CreateSecurityGroup
ec2:DescribeVpcs

// RDS - Create Aurora cluster
rds:CreateDBCluster
rds:DescribeDBClusters

// Bedrock - No deployment permissions needed
// (Runtime permissions granted to ECS tasks)

// S3 - Store artifacts
s3:PutObject
s3:GetObject

// CloudWatch - Write logs
logs:CreateLogGroup
logs:CreateLogStream
logs:PutLogEvents
```

### Security Best Practices

1. **No Static Credentials**: Uses IAM role with temporary credentials
2. **Least Privilege**: Only grants permissions needed for deployment
3. **Resource Restrictions**: Limits IAM PassRole to specific services
4. **Encryption**: S3 artifacts encrypted at rest
5. **Audit Logging**: All CodeBuild actions logged to CloudTrail

## Environment Variables

### Build-Time Variables

Configured in `buildspec.yml`:

```yaml
env:
  variables:
    AWS_DEFAULT_REGION: us-east-1
    IMAGE_TAG: latest

  parameter-store:
    # Optional: Store secrets in SSM Parameter Store
    # COGNITO_USER_POOL_ID: /mangoo/cognito/user-pool-id

  exported-variables:
    - IMAGE_TAG
    - BACKEND_IMAGE_URI
    - FRONTEND_IMAGE_URI
```

### Override in CodeBuild Console

You can override variables in the AWS Console:

1. Navigate to CodeBuild → Projects → mangoo-build-deploy
2. Click "Edit" → "Environment"
3. Add environment variables:
   - `IMAGE_TAG`: Custom image tag
   - `CDK_ENV`: Deployment environment (dev, prod)

## Artifacts

### S3 Storage

Build artifacts are stored in S3 with:

```
s3://mangoo-artifacts-{account-id}/builds/{build-id}/
├── cdk-outputs.json          # CDK stack outputs
├── backend/                   # Backend source
├── frontend/dist/             # Compiled frontend
└── cdk/cdk.out/              # CDK synthesized templates
```

**Lifecycle Policy**:
- Transition to Infrequent Access after 7 days
- Expire after 30 days

### Artifact Contents

1. **cdk-outputs.json**: CDK stack outputs (endpoints, ARNs)
2. **frontend/dist/**: Compiled React application
3. **cdk/cdk.out/**: CloudFormation templates
4. **Test reports**: JUnit XML format (if tests enabled)

## Caching

CodeBuild uses local caching to speed up builds:

```yaml
cache:
  paths:
    - 'backend/.venv/**/*'          # Python virtual env
    - 'frontend/node_modules/**/*'  # npm packages
    - 'cdk/node_modules/**/*'       # CDK packages
    - '/root/.npm/**/*'             # npm cache
    - '/root/.cache/pip/**/*'       # pip cache
```

**Cache Benefits**:
- First build: ~15-20 minutes
- Cached build: ~5-7 minutes (if no dependency changes)

**Cache is invalidated when**:
- `requirements.txt` changes
- `package.json` changes
- Docker base images are updated

## Deployment Flow

### Automatic Deployment (Main Branch)

1. **Developer pushes to main**:
   ```bash
   git push origin main
   ```

2. **GitHub webhook triggers CodeBuild**:
   - Webhook configured in CDK stack
   - Filters: Push events on main branch only

3. **CodeBuild runs buildspec.yml**:
   - Installs dependencies
   - Builds Docker images
   - Pushes to ECR
   - Deploys CDK stacks

4. **ECS picks up new images**:
   - Force new deployment triggered
   - Tasks drain connections
   - New tasks start with updated images

5. **Deployment complete**:
   - Outputs written to S3
   - Logs available in CloudWatch

### Manual Deployment

Trigger a build manually:

```bash
# Via AWS CLI
aws codebuild start-build \
  --project-name mangoo-build-deploy \
  --source-version main

# With custom environment variables
aws codebuild start-build \
  --project-name mangoo-build-deploy \
  --source-version main \
  --environment-variables-override \
    name=IMAGE_TAG,value=v1.2.3,type=PLAINTEXT
```

### Branch-Specific Deployments

To deploy from a feature branch:

1. Update webhook filter in `codebuild-stack.ts`:
   ```typescript
   webhookFilters: [
     codebuild.FilterGroup.inEventOf(
       codebuild.EventAction.PUSH
     ).andBranchIs('develop'),  // Add your branch
   ]
   ```

2. Deploy CDK stack:
   ```bash
   cdk deploy MangooCodeBuildStack
   ```

## Monitoring

### CloudWatch Logs

View build logs:

```bash
# Via AWS CLI
aws logs tail /aws/codebuild/mangoo --follow

# Via Console
CloudWatch → Log groups → /aws/codebuild/mangoo
```

**Log Structure**:
```
/aws/codebuild/mangoo
└── {build-id}
    ├── [Container] Phase: DOWNLOAD_SOURCE
    ├── [Container] Phase: INSTALL
    ├── [Container] Phase: PRE_BUILD
    ├── [Container] Phase: BUILD
    └── [Container] Phase: POST_BUILD
```

### Build History

View past builds:

```bash
# List recent builds
aws codebuild list-builds-for-project \
  --project-name mangoo-build-deploy \
  --max-items 10

# Get build details
aws codebuild batch-get-builds \
  --ids {build-id}
```

### Metrics

Key metrics to monitor:

- **Build Duration**: Should be < 20 minutes
- **Success Rate**: Target > 95%
- **Cache Hit Rate**: Target > 80%
- **Image Size**: Backend ~200MB, Frontend ~50MB

## Troubleshooting

### Build Fails in Install Phase

**Symptoms**: npm ci or pip install fails

**Solutions**:
- Check internet connectivity
- Verify package.json/requirements.txt syntax
- Clear cache: Delete and recreate CodeBuild project

### Docker Build Fails

**Symptoms**: "docker: command not found" or permission errors

**Solutions**:
- Verify `privileged: true` in environment
- Check buildImage is STANDARD_7_0 or higher
- Ensure Docker daemon is running in container

### ECR Push Fails

**Symptoms**: "authentication token has expired" or "access denied"

**Solutions**:
- Verify IAM role has `ecr:*` permissions
- Check ECR login command in pre_build phase
- Ensure AWS_REGION is correctly set

### CDK Deploy Fails

**Symptoms**: CloudFormation errors during deployment

**Solutions**:
- Check IAM role has CloudFormation permissions
- Verify CDK bootstrap is done: `cdk bootstrap`
- Look for resource limit errors (e.g., max VPCs)
- Check CDK outputs in logs for specific error

### ECS Service Not Updating

**Symptoms**: Deployment succeeds but old containers still running

**Solutions**:
- Verify `force-new-deployment` flag in post_build
- Check ECS service exists: `aws ecs describe-services`
- Manually update service if needed
- Check task definition has new image URI

### Build Timeout

**Symptoms**: Build exceeds 60 minutes

**Solutions**:
- Increase timeout in codebuild-stack.ts:
  ```typescript
  timeout: cdk.Duration.minutes(90)
  ```
- Optimize Docker build (use multi-stage builds)
- Enable caching to speed up dependencies

## Cost Optimization

### Build Minutes Pricing

**AWS CodeBuild Pricing** (us-east-1):
- Compute: $0.005/minute (LARGE instance)
- Typical build: 15 minutes = $0.075
- 100 builds/month: ~$7.50

**Included in Free Tier**:
- 100 build minutes/month (general1.small)
- Not applicable for LARGE instance

### S3 Storage Pricing

- $0.023/GB/month (Standard)
- Typical artifact: 100MB
- 30 days retention: ~$0.07/month

### ECR Storage Pricing

- $0.10/GB/month
- Backend image: 200MB
- Frontend image: 50MB
- Total: ~$0.025/month

**Total CI/CD Cost**: ~$10-15/month (100 builds)

### Optimization Tips

1. **Use caching**: Reduces build time by 50-70%
2. **Multi-stage builds**: Smaller final images
3. **Prune old images**: Delete unused ECR images
4. **Reduce artifact retention**: 7 days instead of 30
5. **Use smaller compute**: Switch to MEDIUM if possible

## Security

### Secrets Management

**Don't hardcode secrets** in buildspec.yml. Use:

1. **SSM Parameter Store**:
   ```yaml
   env:
     parameter-store:
       DB_PASSWORD: /mangoo/prod/db-password
   ```

2. **Secrets Manager**:
   ```yaml
   env:
     secrets-manager:
       DB_CREDS: prod/database:username
   ```

3. **Environment variables** (CodeBuild Console):
   - For non-sensitive config only
   - Visible in build logs

### Image Scanning

ECR automatically scans images for vulnerabilities:

```bash
# View scan results
aws ecr describe-image-scan-findings \
  --repository-name mangoo-backend \
  --image-id imageTag=latest
```

**Recommended**: Set up EventBridge rule to alert on HIGH/CRITICAL findings.

### VPC Configuration

For enhanced security, run CodeBuild in VPC:

```typescript
new codebuild.Project(this, 'MangooCodeBuild', {
  vpc: vpc,
  subnetSelection: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  },
  securityGroups: [buildSecurityGroup],
  // ...
});
```

**Benefits**:
- Access to private resources (RDS, private ECR)
- Network-level isolation
- VPC Flow Logs for audit

**Note**: Requires NAT Gateway ($32/month) or VPC endpoints

## Advanced Configuration

### Multi-Environment Deployment

Deploy to dev/staging/prod:

```yaml
# buildspec-dev.yml
env:
  variables:
    ENVIRONMENT: dev
    CDK_STACK_NAME: MangooStack-Dev

# buildspec-prod.yml
env:
  variables:
    ENVIRONMENT: prod
    CDK_STACK_NAME: MangooStack-Prod
```

Create separate CodeBuild projects:
- `mangoo-build-dev` → develop branch
- `mangoo-build-prod` → main branch

### Integration Tests

Add test phase to buildspec.yml:

```yaml
phases:
  build:
    commands:
      # ... build steps

      # Run backend tests
      - cd backend
      - pytest tests/ --junitxml=test-results/junit.xml
      - cd ..

      # Run frontend tests
      - cd frontend
      - npm test -- --ci --reporters=jest-junit
      - cd ..
```

### Notifications

Get build notifications via SNS:

```typescript
const topic = new sns.Topic(this, 'BuildNotifications');

project.onBuildFailed('BuildFailed', {
  target: new targets.SnsTopic(topic),
});

project.onBuildSucceeded('BuildSucceeded', {
  target: new targets.SnsTopic(topic),
});
```

### Approval Steps

For production deployments, add manual approval:

```typescript
const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
  stages: [
    {
      stageName: 'Source',
      actions: [sourceAction],
    },
    {
      stageName: 'Build',
      actions: [buildAction],
    },
    {
      stageName: 'Approve',
      actions: [
        new codepipeline_actions.ManualApprovalAction({
          actionName: 'ApproveDeployment',
        }),
      ],
    },
    {
      stageName: 'Deploy',
      actions: [deployAction],
    },
  ],
});
```

## Best Practices

1. ✅ **Use caching** for faster builds
2. ✅ **Pin dependency versions** in requirements.txt and package.json
3. ✅ **Tag images** with commit hash for traceability
4. ✅ **Run tests** before deployment
5. ✅ **Use SSM Parameter Store** for secrets
6. ✅ **Enable ECR image scanning**
7. ✅ **Set up build notifications**
8. ✅ **Monitor build metrics** in CloudWatch
9. ✅ **Keep buildspec.yml** in version control
10. ✅ **Document custom environment variables**

## Migration from GitHub Actions

### Removed Files

```
.github/
└── workflows/
    └── deploy.yml  ❌ Deleted
```

### Equivalent Features

| GitHub Actions | CodeBuild |
|----------------|-----------|
| Workflow file | buildspec.yml |
| Secrets | SSM Parameter Store |
| Matrix builds | Multiple CodeBuild projects |
| Artifacts | S3 bucket |
| Logs | CloudWatch Logs |
| Triggers | GitHub webhooks |
| Badges | CloudWatch dashboards |

### Benefits of CodeBuild

1. **Native AWS integration**: No external credentials
2. **VPC support**: Access private resources
3. **IAM roles**: Temporary credentials only
4. **Cost**: Only pay for build minutes used
5. **Scalability**: No concurrency limits
6. **Security**: AWS-managed infrastructure

## References

- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [Buildspec Reference](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html)
- [CDK CodeBuild Construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_codebuild-readme.html)
- [ECR Image Scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html)
