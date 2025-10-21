import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface CodeBuildStackProps extends cdk.StackProps {
  readonly githubRepo: string;
  readonly githubBranch?: string;
}

export class CodeBuildStack extends cdk.Stack {
  public readonly project: codebuild.Project;
  public readonly artifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CodeBuildStackProps) {
    super(scope, id, props);

    const githubBranch = props.githubBranch || 'main';

    // ========================================
    // S3 Bucket for Build Artifacts
    // ========================================
    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `mangoo-artifacts-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // ========================================
    // CloudWatch Log Group for Build Logs
    // ========================================
    const logGroup = new logs.LogGroup(this, 'BuildLogGroup', {
      logGroupName: '/aws/codebuild/mangoo',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // IAM Role for CodeBuild
    // ========================================
    const buildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'Service role for Mangoo CodeBuild project',
      managedPolicies: [
        // Basic execution permissions
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });

    // ECR permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:CreateRepository',
          'ecr:DescribeRepositories',
        ],
        resources: ['*'],
      })
    );

    // S3 permissions for artifacts
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
        resources: [this.artifactBucket.bucketArn, `${this.artifactBucket.bucketArn}/*`],
      })
    );

    // ECS permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:UpdateService',
          'ecs:DescribeServices',
          'ecs:DescribeClusters',
          'ecs:DescribeTaskDefinition',
          'ecs:RegisterTaskDefinition',
          'ecs:DeregisterTaskDefinition',
        ],
        resources: ['*'],
      })
    );

    // CloudFormation permissions for CDK
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResources',
          'cloudformation:GetTemplate',
          'cloudformation:ValidateTemplate',
        ],
        resources: ['*'],
      })
    );

    // IAM permissions for CDK (least privilege)
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:GetRole',
          'iam:PassRole',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRolePolicy',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'iam:PassedToService': [
              'ecs-tasks.amazonaws.com',
              'lambda.amazonaws.com',
              'codebuild.amazonaws.com',
            ],
          },
        },
      })
    );

    // VPC and networking permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:CreateVpc',
          'ec2:CreateSubnet',
          'ec2:CreateSecurityGroup',
          'ec2:DescribeVpcs',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeRouteTables',
          'ec2:DescribeNetworkInterfaces',
          'ec2:CreateTags',
          'ec2:DeleteSecurityGroup',
          'ec2:AuthorizeSecurityGroupIngress',
          'ec2:AuthorizeSecurityGroupEgress',
          'ec2:RevokeSecurityGroupIngress',
          'ec2:RevokeSecurityGroupEgress',
        ],
        resources: ['*'],
      })
    );

    // RDS permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'rds:CreateDBCluster',
          'rds:DeleteDBCluster',
          'rds:DescribeDBClusters',
          'rds:ModifyDBCluster',
          'rds:CreateDBInstance',
          'rds:DeleteDBInstance',
          'rds:DescribeDBInstances',
        ],
        resources: ['*'],
      })
    );

    // Bedrock permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:ListFoundationModels',
        ],
        resources: ['*'],
      })
    );

    // Cognito permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:CreateUserPool',
          'cognito-idp:DeleteUserPool',
          'cognito-idp:DescribeUserPool',
          'cognito-idp:UpdateUserPool',
          'cognito-idp:CreateUserPoolClient',
          'cognito-idp:DeleteUserPoolClient',
        ],
        resources: ['*'],
      })
    );

    // ALB permissions
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'elasticloadbalancing:CreateLoadBalancer',
          'elasticloadbalancing:DeleteLoadBalancer',
          'elasticloadbalancing:DescribeLoadBalancers',
          'elasticloadbalancing:CreateTargetGroup',
          'elasticloadbalancing:DeleteTargetGroup',
          'elasticloadbalancing:DescribeTargetGroups',
          'elasticloadbalancing:CreateListener',
          'elasticloadbalancing:DeleteListener',
          'elasticloadbalancing:DescribeListeners',
        ],
        resources: ['*'],
      })
    );

    // ========================================
    // CodeBuild Project
    // ========================================
    this.project = new codebuild.Project(this, 'MangooCodeBuild', {
      projectName: 'mangoo-build-deploy',
      description: 'Build and deploy Mangoo AI Platform',
      role: buildRole,

      // Build spec inline - clones repo then continues with repo's buildspec
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          variables: {
            AWS_DEFAULT_REGION: 'us-east-1',
            IMAGE_TAG: 'latest',
          },
          'exported-variables': ['IMAGE_TAG', 'BACKEND_IMAGE_URI', 'FRONTEND_IMAGE_URI'],
        },
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
              python: 3.11,
              docker: 20,
            },
            commands: [
              'echo "Cloning repository https://github.com/$GITHUB_REPO (branch $GITHUB_BRANCH)..."',
              'git clone --depth 1 --single-branch --branch $GITHUB_BRANCH https://github.com/$GITHUB_REPO.git repo',
              'cd repo',
              'ls -la',
              'npm install -g aws-cdk@latest',
              'cd backend && pip install --upgrade pip && pip install -r requirements.txt && cd ..',
              'cd cdk && npm ci && cd ..',
              'cd frontend && npm ci && cd ..',
            ],
          },
          pre_build: {
            commands: [
              'cd repo',
              'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
              'export AWS_REGION=${AWS_DEFAULT_REGION}',
              'export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com',
              'export IMAGE_TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION:-latest}',
              'aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}',
              'aws ecr describe-repositories --repository-names mangoo-backend --region ${AWS_REGION} 2>/dev/null || aws ecr create-repository --repository-name mangoo-backend --region ${AWS_REGION} --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256',
              'aws ecr describe-repositories --repository-names mangoo-frontend --region ${AWS_REGION} 2>/dev/null || aws ecr create-repository --repository-name mangoo-frontend --region ${AWS_REGION} --image-scanning-configuration scanOnPush=true --encryption-configuration encryptionType=AES256',
            ],
          },
          build: {
            commands: [
              'cd repo/backend',
              'docker build --platform linux/amd64 -t mangoo-backend:${IMAGE_TAG} -t mangoo-backend:latest .',
              'docker tag mangoo-backend:${IMAGE_TAG} ${ECR_REGISTRY}/mangoo-backend:${IMAGE_TAG}',
              'docker tag mangoo-backend:${IMAGE_TAG} ${ECR_REGISTRY}/mangoo-backend:latest',
              'cd ../frontend',
              'npm run build',
              'docker build --platform linux/amd64 -t mangoo-frontend:${IMAGE_TAG} -t mangoo-frontend:latest .',
              'docker tag mangoo-frontend:${IMAGE_TAG} ${ECR_REGISTRY}/mangoo-frontend:${IMAGE_TAG}',
              'docker tag mangoo-frontend:${IMAGE_TAG} ${ECR_REGISTRY}/mangoo-frontend:latest',
              'cd ..',
              'export BACKEND_IMAGE_URI=${ECR_REGISTRY}/mangoo-backend:${IMAGE_TAG}',
              'export FRONTEND_IMAGE_URI=${ECR_REGISTRY}/mangoo-frontend:${IMAGE_TAG}',
            ],
          },
          post_build: {
            commands: [
              'cd repo',
              'docker push ${ECR_REGISTRY}/mangoo-backend:${IMAGE_TAG}',
              'docker push ${ECR_REGISTRY}/mangoo-backend:latest',
              'docker push ${ECR_REGISTRY}/mangoo-frontend:${IMAGE_TAG}',
              'docker push ${ECR_REGISTRY}/mangoo-frontend:latest',
              'cd cdk',
              'npx cdk synth',
              'npx cdk deploy --all --require-approval never --outputs-file ../cdk-outputs.json',
              'cd ..',
              'aws ecs update-service --cluster mangoo-cluster --service mangoo-backend-service --force-new-deployment --region ${AWS_REGION} || echo "ECS service not found"',
            ],
          },
        },
        artifacts: {
          files: ['repo/cdk-outputs.json', 'repo/backend/**/*', 'repo/frontend/dist/**/*'],
          name: 'mangoo-build-artifacts',
        },
      }),

      // Build environment
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.LARGE, // 8GB RAM, 4 vCPUs
        privileged: true, // Required for Docker builds
        environmentVariables: {
          AWS_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.region,
          },
          AWS_ACCOUNT_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.account,
          },
          IMAGE_TAG: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: 'latest',
          },
          GITHUB_REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: props.githubRepo,
          },
          GITHUB_BRANCH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: githubBranch,
          },
        },
      },

      // Artifacts (overridden by inline buildspec above)
      artifacts: codebuild.Artifacts.s3({
        bucket: this.artifactBucket,
        includeBuildId: true,
        packageZip: false,
        path: 'builds',
      }),

      // Logging
      logging: {
        cloudWatch: {
          logGroup,
          enabled: true,
        },
      },

      // Cache for faster builds
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.DOCKER_LAYER,
        codebuild.LocalCacheMode.CUSTOM
      ),

      // Timeout
      timeout: cdk.Duration.minutes(60),

      // VPC configuration (optional - uncomment if needed)
      // vpc: vpc,
      // subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: this.project.projectName,
      description: 'CodeBuild project name',
      exportName: 'MangooCodeBuildProject',
    });

    new cdk.CfnOutput(this, 'CodeBuildProjectArn', {
      value: this.project.projectArn,
      description: 'CodeBuild project ARN',
    });

    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: this.artifactBucket.bucketName,
      description: 'S3 bucket for build artifacts',
    });

    new cdk.CfnOutput(this, 'BuildLogGroupName', {
      value: logGroup.logGroupName,
      description: 'CloudWatch log group for builds',
    });
  }
}
