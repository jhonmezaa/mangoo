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

      // NOTE: We don't specify source here - buildspec will clone the repo
      // This avoids GitHub OAuth requirements for public repos

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

      // Inline buildspec with git clone
      buildSpec: codebuild.BuildSpec.fromAsset('../buildspec.yml'),

      // Artifacts
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
