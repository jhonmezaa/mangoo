#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MangooStack } from '../lib/mangoo-stack';

const app = new cdk.App();

new MangooStack(app, 'MangooStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Mangoo AI Platform - Multi-agent marketplace with ECS Fargate and Aurora PostgreSQL',
});

app.synth();
