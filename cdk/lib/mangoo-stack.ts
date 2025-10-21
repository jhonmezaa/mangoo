import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class MangooStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // VPC Configuration
    // ========================================
    const vpc = new ec2.Vpc(this, 'MangooVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ========================================
    // Aurora PostgreSQL Serverless v2
    // ========================================
    const dbPasswordSecret = new secretsmanager.Secret(this, 'DBPasswordSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for Aurora PostgreSQL',
      allowAllOutbound: false,
    });

    const dbCluster = new rds.DatabaseCluster(this, 'MangooDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      credentials: rds.Credentials.fromSecret(dbPasswordSecret),
      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
      }),
      readers: [
        rds.ClusterInstance.serverlessV2('reader', {
          scaleWithWriter: true,
          autoMinorVersionUpgrade: true,
        }),
      ],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      defaultDatabaseName: 'mangoo',
      backup: {
        retention: cdk.Duration.days(7),
      },
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      deletionProtection: false, // Set to true in production
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // Enable pgvector extension
    const initDbLambda = new cdk.CustomResource(this, 'InitDbCustomResource', {
      serviceToken: this.createInitDbFunction(vpc, dbSecurityGroup, dbCluster, dbPasswordSecret),
    });

    // ========================================
    // Cognito User Pool
    // ========================================
    const userPool = new cognito.UserPool(this, 'MangooUserPool', {
      userPoolName: 'mangoo-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('MangooAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
      },
    });

    const userPoolDomain = userPool.addDomain('MangooUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `mangoo-${cdk.Stack.of(this).account}`,
      },
    });

    // ========================================
    // ECS Cluster and Services
    // ========================================
    const cluster = new ecs.Cluster(this, 'MangooCluster', {
      vpc,
      clusterName: 'mangoo-cluster',
      containerInsights: true,
    });

    // Backend Task Definition
    const backendTaskDefinition = new ecs.FargateTaskDefinition(this, 'BackendTask', {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    // Grant Bedrock permissions
    backendTaskDefinition.addToTaskRolePolicy(
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

    const backendContainer = backendTaskDefinition.addContainer('backend', {
      image: ecs.ContainerImage.fromAsset('../backend'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'backend',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        APP_NAME: 'Mangoo AI Platform',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
        BEDROCK_REGION: this.region,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        BEDROCK_EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(dbPasswordSecret, 'password'),
        SECRET_KEY: ecs.Secret.fromSecretsManager(dbPasswordSecret, 'password'),
      },
    });

    backendContainer.addPortMappings({
      containerPort: 8000,
      protocol: ecs.Protocol.TCP,
    });

    // Backend Security Group
    const backendSecurityGroup = new ec2.SecurityGroup(this, 'BackendSecurityGroup', {
      vpc,
      description: 'Security group for backend ECS tasks',
    });

    dbSecurityGroup.addIngressRule(
      backendSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow backend to access database'
    );

    // Backend Service
    const backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDefinition,
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [backendSecurityGroup],
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: {
        rollback: true,
      },
    });

    // Auto Scaling
    const backendScaling = backendService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    backendScaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });

    backendScaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
    });

    // ========================================
    // Application Load Balancer (Internal)
    // Configured for SSE streaming support
    // ========================================
    const alb = new elbv2.ApplicationLoadBalancer(this, 'MangooALB', {
      vpc,
      internetFacing: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      // Critical for SSE: ALB must keep connections open
      idleTimeout: cdk.Duration.seconds(120),
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const targetGroup = listener.addTargets('BackendTarget', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendService],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      stickinessCookieDuration: cdk.Duration.hours(1),
    });

    // Configure target group attributes for SSE
    const cfnTargetGroup = targetGroup.node.defaultChild as elbv2.CfnTargetGroup;
    cfnTargetGroup.addPropertyOverride('TargetGroupAttributes', [
      {
        Key: 'deregistration_delay.timeout_seconds',
        Value: '30',
      },
      {
        Key: 'stickiness.enabled',
        Value: 'true',
      },
      {
        Key: 'stickiness.type',
        Value: 'lb_cookie',
      },
    ]);

    backendSecurityGroup.addIngressRule(
      alb,
      ec2.Port.tcp(8000),
      'Allow ALB to access backend'
    );

    // ========================================
    // API Gateway HTTP API with VPC Link
    // ========================================
    const vpcLink = new apigatewayv2.VpcLink(this, 'MangooVpcLink', {
      vpc,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Note: API Gateway v2 integration requires additional setup
    // This is a placeholder for the HTTP API setup

    // ========================================
    // WAF Configuration
    // ========================================
    const wafRules: wafv2.CfnWebACL.RuleProperty[] = [
      {
        name: 'RateLimitRule',
        priority: 1,
        action: { block: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'RateLimitRule',
        },
        statement: {
          rateBasedStatement: {
            limit: 2000,
            aggregateKeyType: 'IP',
          },
        },
      },
      {
        name: 'AWSManagedRulesCommonRuleSet',
        priority: 2,
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'AWSManagedRulesCommonRuleSet',
        },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet',
          },
        },
      },
    ];

    // ========================================
    // CloudFront for Frontend
    // ========================================
    // Frontend distribution would be added here
    // Using S3 + CloudFront for static hosting

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL endpoint',
    });

    new cdk.CfnOutput(this, 'ALBEndpoint', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS',
    });
  }

  private createInitDbFunction(
    vpc: ec2.IVpc,
    dbSecurityGroup: ec2.SecurityGroup,
    dbCluster: rds.IDatabaseCluster,
    secret: secretsmanager.ISecret
  ): string {
    // This would create a Lambda function to initialize the database with pgvector
    // For brevity, returning a placeholder
    return 'arn:aws:lambda:us-east-1:123456789012:function:placeholder';
  }
}
