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
          'ecr:DescribeImages',
          'ecr:ListImages',
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

    // S3 permissions for CDK bootstrap assets bucket
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject*',
          's3:GetBucket*',
          's3:List*',
          's3:DeleteObject*',
          's3:PutObject*',
          's3:Abort*',
        ],
        resources: [
          `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}`,
          `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`,
        ],
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

    // SSM permissions for CDK bootstrap version check
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
        ],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`],
      })
    );

    // STS permissions to assume CDK roles
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*`,
        ],
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
          'ec2:DescribeAvailabilityZones',
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

      // Inline buildspec with git clone (bedrock-chat approach)
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
              python: 3.11,
            },
            commands: [
              'echo "Cloning repository..."',
              `git clone --depth 1 https://github.com/${props.githubRepo}.git /tmp/repo`,
              'cp -r /tmp/repo/. .',
              'rm -rf /tmp/repo',
              'ls -la',
              'echo "Installing AWS CDK..."',
              'npm install -g aws-cdk@latest',
            ],
          },
          pre_build: {
            commands: [
              'echo "Installing dependencies..."',
              'cd backend && pip install --upgrade pip && pip install -r requirements.txt && cd ..',
              'cd cdk && npm install && cd ..',
              'cd frontend && npm install && cd ..',
            ],
          },
          build: {
            commands: [
              'export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
              'export AWS_REGION=us-east-1',
              'export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com',
              'echo "Logging into ECR..."',
              'aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}',
              'echo "Creating ECR repositories..."',
              'aws ecr describe-repositories --repository-names mangoo-backend --region ${AWS_REGION} || aws ecr create-repository --repository-name mangoo-backend --region ${AWS_REGION}',
              'aws ecr describe-repositories --repository-names mangoo-frontend --region ${AWS_REGION} || aws ecr create-repository --repository-name mangoo-frontend --region ${AWS_REGION}',
              'echo "Building and pushing backend..."',
              'cd backend && docker build -t ${ECR_REGISTRY}/mangoo-backend:latest . && docker push ${ECR_REGISTRY}/mangoo-backend:latest && cd ..',
              'echo "Building and pushing frontend..."',
              'cd frontend && npm run build && docker build -t ${ECR_REGISTRY}/mangoo-frontend:latest . && docker push ${ECR_REGISTRY}/mangoo-frontend:latest && cd ..',
              'echo "Deploying with CDK..."',
              'cd cdk && npx cdk deploy --all --require-approval never',
            ],
          },
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
