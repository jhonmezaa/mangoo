#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MangooStack } from '../lib/mangoo-stack';
import { CodeBuildStack } from '../lib/codebuild-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Deploy CodeBuild CI/CD infrastructure
new CodeBuildStack(app, 'MangooCodeBuildStack', {
  env,
  description: 'Mangoo AI Platform - CodeBuild CI/CD Pipeline',
  githubRepo: 'jhonmezaa/mangoo',
  githubBranch: 'main',
});

// Deploy main application infrastructure
new MangooStack(app, 'MangooStack', {
  env,
  description: 'Mangoo AI Platform - Multi-agent marketplace with ECS Fargate and Aurora PostgreSQL',
});

app.synth();
