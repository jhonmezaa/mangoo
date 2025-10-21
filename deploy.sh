#!/bin/bash

# Mangoo AI Platform - Automated Deployment Script
# Similar to aws-samples/bedrock-chat deployment approach
# This script sets up CodeBuild infrastructure and triggers the first deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_DIR="${SCRIPT_DIR}/cdk"
REGION="${AWS_REGION:-us-east-1}"
GITHUB_REPO="jhonmezaa/mangoo"
GITHUB_BRANCH="main"

# Banner
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║          Mangoo AI Platform - Deployment Script          ║"
echo "║                                                           ║"
echo "║    Automated deployment using AWS CodeBuild & CDK         ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Helper functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo ""
    echo -e "${GREEN}==>${NC} $1"
    echo ""
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verify prerequisites
check_prerequisites() {
    print_step "Step 1: Checking prerequisites"

    local missing_deps=0

    # Check AWS CLI
    if ! command_exists aws; then
        print_error "AWS CLI is not installed. Please install it from: https://aws.amazon.com/cli/"
        missing_deps=1
    else
        print_success "AWS CLI is installed"
    fi

    # Check Node.js
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install it from: https://nodejs.org/"
        missing_deps=1
    else
        NODE_VERSION=$(node --version)
        print_success "Node.js is installed (${NODE_VERSION})"
    fi

    # Check npm
    if ! command_exists npm; then
        print_error "npm is not installed. Please install Node.js which includes npm"
        missing_deps=1
    else
        NPM_VERSION=$(npm --version)
        print_success "npm is installed (${NPM_VERSION})"
    fi

    # Check AWS CDK
    if ! command_exists cdk; then
        print_warning "AWS CDK is not installed. Installing globally..."
        npm install -g aws-cdk
        print_success "AWS CDK installed"
    else
        CDK_VERSION=$(cdk --version)
        print_success "AWS CDK is installed (${CDK_VERSION})"
    fi

    # Check jq (optional but useful)
    if ! command_exists jq; then
        print_warning "jq is not installed. Outputs will be less formatted"
        print_info "Install jq: https://stedolan.github.io/jq/"
    else
        print_success "jq is installed"
    fi

    if [ $missing_deps -eq 1 ]; then
        print_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi
}

# Verify AWS credentials
check_aws_credentials() {
    print_step "Step 2: Verifying AWS credentials"

    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid"
        print_info "Please run: aws configure"
        exit 1
    fi

    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER_ARN=$(aws sts get-caller-identity --query Arn --output text)

    print_success "AWS credentials are valid"
    print_info "Account ID: ${AWS_ACCOUNT_ID}"
    print_info "User/Role: ${AWS_USER_ARN}"
    print_info "Region: ${REGION}"
}

# Check Bedrock access
check_bedrock_access() {
    print_step "Step 3: Checking Amazon Bedrock access"

    print_info "Verifying Bedrock model access..."

    # Check if Bedrock is available in region
    if ! aws bedrock list-foundation-models --region ${REGION} &> /dev/null; then
        print_error "Amazon Bedrock is not accessible in region ${REGION}"
        print_info "Please ensure Bedrock is enabled in your region"
        exit 1
    fi

    # Check for Claude model access
    CLAUDE_MODELS=$(aws bedrock list-foundation-models \
        --region ${REGION} \
        --query 'modelSummaries[?contains(modelId, `claude-3-5`)].modelId' \
        --output text 2>/dev/null || echo "")

    if [ -z "$CLAUDE_MODELS" ]; then
        print_warning "Claude 3.5 model access not verified"
        print_info "Please request access to Anthropic Claude models in Bedrock console"
        print_info "https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
    else
        print_success "Claude 3.5 models are accessible"
    fi

    # Check for Titan Embeddings
    TITAN_MODELS=$(aws bedrock list-foundation-models \
        --region ${REGION} \
        --query 'modelSummaries[?contains(modelId, `titan-embed`)].modelId' \
        --output text 2>/dev/null || echo "")

    if [ -z "$TITAN_MODELS" ]; then
        print_warning "Titan Embeddings model access not verified"
    else
        print_success "Titan Embeddings models are accessible"
    fi
}

# Bootstrap CDK
bootstrap_cdk() {
    print_step "Step 4: Bootstrapping AWS CDK"

    print_info "Checking if CDK is already bootstrapped in ${REGION}..."

    # Check if CDK bootstrap stack exists
    BOOTSTRAP_STACK=$(aws cloudformation describe-stacks \
        --stack-name CDKToolkit \
        --region ${REGION} \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")

    if [ "$BOOTSTRAP_STACK" == "NOT_FOUND" ]; then
        print_info "Bootstrapping CDK for the first time..."
        cd "${CDK_DIR}"
        cdk bootstrap aws://${AWS_ACCOUNT_ID}/${REGION}
        cd "${SCRIPT_DIR}"
        print_success "CDK bootstrap completed"
    else
        print_success "CDK is already bootstrapped (Status: ${BOOTSTRAP_STACK})"
    fi
}

# Install dependencies
install_dependencies() {
    print_step "Step 5: Installing dependencies"

    # Install CDK dependencies
    print_info "Installing CDK dependencies..."
    cd "${CDK_DIR}"
    npm install
    print_success "CDK dependencies installed"

    # Build CDK project
    print_info "Building CDK project..."
    npm run build
    print_success "CDK project built"

    cd "${SCRIPT_DIR}"
}

# Deploy CodeBuild stack
deploy_codebuild() {
    print_step "Step 6: Deploying CodeBuild infrastructure"

    cd "${CDK_DIR}"

    print_info "Synthesizing CDK stacks..."
    cdk synth MangooCodeBuildStack

    print_info "Deploying CodeBuild stack..."
    print_warning "This will create CodeBuild project, S3 bucket, and IAM roles"
    print_info "Estimated cost: ~$10-15/month for CI/CD"
    echo ""

    # Deploy with auto-approval
    cdk deploy MangooCodeBuildStack \
        --require-approval never \
        --outputs-file "${SCRIPT_DIR}/codebuild-outputs.json"

    print_success "CodeBuild stack deployed"

    cd "${SCRIPT_DIR}"
}

# Extract outputs
extract_outputs() {
    print_step "Step 7: Extracting deployment outputs"

    if [ -f "${SCRIPT_DIR}/codebuild-outputs.json" ]; then
        if command_exists jq; then
            CODEBUILD_PROJECT=$(jq -r '.MangooCodeBuildStack.CodeBuildProjectName' "${SCRIPT_DIR}/codebuild-outputs.json" 2>/dev/null || echo "")
            ARTIFACT_BUCKET=$(jq -r '.MangooCodeBuildStack.ArtifactBucketName' "${SCRIPT_DIR}/codebuild-outputs.json" 2>/dev/null || echo "")
            LOG_GROUP=$(jq -r '.MangooCodeBuildStack.BuildLogGroup' "${SCRIPT_DIR}/codebuild-outputs.json" 2>/dev/null || echo "")
        else
            CODEBUILD_PROJECT=$(grep -oP '"CodeBuildProjectName":\s*"\K[^"]+' "${SCRIPT_DIR}/codebuild-outputs.json" || echo "")
            ARTIFACT_BUCKET=$(grep -oP '"ArtifactBucketName":\s*"\K[^"]+' "${SCRIPT_DIR}/codebuild-outputs.json" || echo "")
            LOG_GROUP=$(grep -oP '"BuildLogGroup":\s*"\K[^"]+' "${SCRIPT_DIR}/codebuild-outputs.json" || echo "")
        fi

        if [ -n "$CODEBUILD_PROJECT" ]; then
            print_success "CodeBuild Project: ${CODEBUILD_PROJECT}"
        fi
        if [ -n "$ARTIFACT_BUCKET" ]; then
            print_success "Artifact Bucket: ${ARTIFACT_BUCKET}"
        fi
        if [ -n "$LOG_GROUP" ]; then
            print_success "Log Group: ${LOG_GROUP}"
        fi
    else
        print_warning "Output file not found, will use default names"
        CODEBUILD_PROJECT="mangoo-build-deploy"
    fi
}

# Configure GitHub webhook
configure_webhook() {
    print_step "Step 8: Configuring GitHub webhook"

    print_info "GitHub webhook will be configured automatically by CodeBuild"
    print_warning "Note: You may need to grant CodeBuild access to your GitHub repository"
    print_info "Repository: https://github.com/${GITHUB_REPO}"
    print_info "Branch: ${GITHUB_BRANCH}"
    echo ""
    print_info "If webhook setup fails, you can configure it manually:"
    print_info "1. Go to CodeBuild console: https://console.aws.amazon.com/codesuite/codebuild/projects/${CODEBUILD_PROJECT}"
    print_info "2. Click 'Edit' → 'Source'"
    print_info "3. Connect to GitHub and authorize access"
    echo ""
}

# Trigger initial build
trigger_build() {
    print_step "Step 9: Triggering initial deployment"

    read -p "$(echo -e ${YELLOW}Would you like to trigger the first build now? [y/N]:${NC} )" -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Starting CodeBuild project: ${CODEBUILD_PROJECT}"

        BUILD_ID=$(aws codebuild start-build \
            --project-name "${CODEBUILD_PROJECT}" \
            --source-version "${GITHUB_BRANCH}" \
            --query 'build.id' \
            --output text \
            --region ${REGION})

        if [ $? -eq 0 ]; then
            print_success "Build started: ${BUILD_ID}"
            echo ""
            print_info "Monitor the build progress:"
            echo ""
            echo "  1. CloudWatch Logs (live):"
            echo "     aws logs tail /aws/codebuild/mangoo --follow"
            echo ""
            echo "  2. CodeBuild Console:"
            echo "     https://console.aws.amazon.com/codesuite/codebuild/projects/${CODEBUILD_PROJECT}/build/${BUILD_ID}"
            echo ""
            echo "  3. CLI status check:"
            echo "     aws codebuild batch-get-builds --ids ${BUILD_ID}"
            echo ""

            # Ask if user wants to follow logs
            read -p "$(echo -e ${YELLOW}Would you like to follow the build logs now? [y/N]:${NC} )" -n 1 -r
            echo ""

            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_info "Following build logs (Ctrl+C to stop)..."
                sleep 2
                aws logs tail /aws/codebuild/mangoo --follow --region ${REGION} || true
            fi
        else
            print_error "Failed to start build"
            print_info "You can start it manually: aws codebuild start-build --project-name ${CODEBUILD_PROJECT}"
        fi
    else
        print_info "Skipping initial build"
        print_info "To trigger a build manually, run:"
        echo "  aws codebuild start-build --project-name ${CODEBUILD_PROJECT}"
    fi
}

# Deploy main infrastructure (optional)
deploy_main_stack() {
    print_step "Step 10: Main application infrastructure"

    echo ""
    print_info "The main application infrastructure (ECS, Aurora, Cognito, etc.) can be deployed in two ways:"
    echo ""
    echo "  Option 1: Via CodeBuild (Recommended)"
    echo "    - Push code to GitHub → Automatic build and deployment"
    echo "    - git push origin main"
    echo ""
    echo "  Option 2: Direct CDK deployment"
    echo "    - cd cdk && cdk deploy MangooStack"
    echo ""

    read -p "$(echo -e ${YELLOW}Would you like to deploy the main stack now via CDK? [y/N]:${NC} )" -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_warning "This will deploy the full infrastructure:"
        print_info "  - VPC with public/private/isolated subnets"
        print_info "  - Aurora PostgreSQL Serverless v2 cluster"
        print_info "  - ECS Fargate cluster and services"
        print_info "  - Application Load Balancer"
        print_info "  - API Gateway HTTP API"
        print_info "  - Cognito User Pool"
        print_info "  - WAF Web ACL"
        echo ""
        print_warning "Estimated cost: ~$50-100/month"
        print_warning "Deployment time: ~15-20 minutes"
        echo ""

        read -p "$(echo -e ${YELLOW}Continue with deployment? [y/N]:${NC} )" -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "${CDK_DIR}"
            print_info "Deploying main application stack..."

            cdk deploy MangooStack \
                --require-approval never \
                --outputs-file "${SCRIPT_DIR}/main-stack-outputs.json"

            print_success "Main stack deployed"
            cd "${SCRIPT_DIR}"

            # Display outputs
            if [ -f "${SCRIPT_DIR}/main-stack-outputs.json" ] && command_exists jq; then
                echo ""
                print_success "Deployment Outputs:"
                jq -r 'to_entries[] | "  \(.key): \(.value | to_entries[] | "\(.key) = \(.value)")"' \
                    "${SCRIPT_DIR}/main-stack-outputs.json" 2>/dev/null || cat "${SCRIPT_DIR}/main-stack-outputs.json"
            fi
        else
            print_info "Main stack deployment skipped"
        fi
    else
        print_info "Main stack deployment skipped"
        print_info "You can deploy it later using CodeBuild or CDK"
    fi
}

# Print next steps
print_next_steps() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║              Deployment Complete! 🎉                      ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""

    print_success "CodeBuild infrastructure is ready!"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "  1. Verify Bedrock Model Access:"
    echo "     • Go to: https://console.aws.amazon.com/bedrock/home?region=${REGION}#/modelaccess"
    echo "     • Request access to: Anthropic Claude 3.5 Sonnet"
    echo "     • Request access to: Amazon Titan Embeddings v2"
    echo ""
    echo "  2. Trigger Automated Deployment:"
    echo "     • git push origin main"
    echo "     • Webhook will trigger CodeBuild automatically"
    echo ""
    echo "  3. Monitor the Build:"
    echo "     • aws logs tail /aws/codebuild/mangoo --follow"
    echo "     • Or visit: https://console.aws.amazon.com/codesuite/codebuild/projects/${CODEBUILD_PROJECT}"
    echo ""
    echo "  4. After Deployment, Configure Application:"
    echo "     • Create Cognito users"
    echo "     • Configure environment variables if needed"
    echo "     • Test the application endpoints"
    echo ""
    echo "📚 Documentation:"
    echo ""
    echo "  • README.md - Getting started guide"
    echo "  • docs/DEPLOYMENT.md - Detailed deployment guide"
    echo "  • docs/CODEBUILD_CI_CD.md - CI/CD documentation"
    echo "  • docs/SSE_STREAMING.md - SSE configuration"
    echo "  • docs/ARCHITECTURE.md - System architecture"
    echo ""
    echo "💡 Useful Commands:"
    echo ""
    echo "  # Start a build manually"
    echo "  aws codebuild start-build --project-name ${CODEBUILD_PROJECT}"
    echo ""
    echo "  # View build history"
    echo "  aws codebuild list-builds-for-project --project-name ${CODEBUILD_PROJECT}"
    echo ""
    echo "  # Watch logs in real-time"
    echo "  aws logs tail /aws/codebuild/mangoo --follow"
    echo ""
    echo "  # Deploy main stack via CDK"
    echo "  cd cdk && cdk deploy MangooStack"
    echo ""
    echo "  # Destroy resources (when needed)"
    echo "  cd cdk && cdk destroy --all"
    echo ""
    echo "🔗 Important Links:"
    echo ""
    echo "  • GitHub Repository: https://github.com/${GITHUB_REPO}"
    echo "  • CodeBuild Project: https://console.aws.amazon.com/codesuite/codebuild/projects/${CODEBUILD_PROJECT}"
    echo "  • CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Faws\$252Fcodebuild\$252Fmangoo"
    echo "  • S3 Artifacts: https://s3.console.aws.amazon.com/s3/buckets/${ARTIFACT_BUCKET}"
    echo ""
    echo "💰 Estimated Monthly Costs:"
    echo ""
    echo "  • CodeBuild (100 builds): ~$10-15"
    echo "  • ECS Fargate: ~$30"
    echo "  • Aurora Serverless v2: ~$15"
    echo "  • NAT Gateway: ~$32"
    echo "  • ALB: ~$20"
    echo "  • Other services: ~$10"
    echo "  • Total: ~$100-120/month"
    echo ""
    print_success "Happy coding! 🚀"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    check_aws_credentials
    check_bedrock_access
    bootstrap_cdk
    install_dependencies
    deploy_codebuild
    extract_outputs
    configure_webhook
    trigger_build
    deploy_main_stack
    print_next_steps
}

# Run main function
main "$@"
