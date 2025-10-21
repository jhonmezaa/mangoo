#!/usr/bin/env python3
"""
Test Amazon Bedrock connectivity and model access.
"""
import sys
import os
import boto3
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.core.config import settings


def test_bedrock_connection():
    """Test Bedrock connectivity."""
    print("🔍 Testing Amazon Bedrock connection...\n")

    try:
        # Initialize Bedrock clients
        bedrock = boto3.client('bedrock', region_name=settings.BEDROCK_REGION)
        bedrock_runtime = boto3.client('bedrock-runtime', region_name=settings.BEDROCK_REGION)

        # List available models
        print("📋 Listing available foundation models...")
        response = bedrock.list_foundation_models()

        claude_models = []
        titan_models = []

        for model in response.get('modelSummaries', []):
            model_id = model['modelId']
            if 'claude' in model_id.lower():
                claude_models.append(model_id)
            elif 'titan' in model_id.lower() and 'embed' in model_id.lower():
                titan_models.append(model_id)

        print(f"\n✅ Found {len(claude_models)} Claude models:")
        for model in claude_models[:5]:
            print(f"   - {model}")

        print(f"\n✅ Found {len(titan_models)} Titan Embedding models:")
        for model in titan_models:
            print(f"   - {model}")

        # Test chat model
        print(f"\n🧪 Testing chat model: {settings.BEDROCK_MODEL_ID}")
        try:
            response = bedrock_runtime.converse(
                modelId=settings.BEDROCK_MODEL_ID,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": "Say 'Hello from Bedrock!' in exactly 4 words."}]
                    }
                ],
                inferenceConfig={
                    "temperature": 0.7,
                    "maxTokens": 50
                }
            )

            output = response['output']['message']['content'][0]['text']
            usage = response['usage']

            print(f"✅ Chat model response: {output}")
            print(f"   Tokens used: {usage['inputTokens']} in, {usage['outputTokens']} out")

        except Exception as e:
            print(f"❌ Chat model error: {e}")

        # Test embedding model
        print(f"\n🧪 Testing embedding model: {settings.BEDROCK_EMBEDDING_MODEL_ID}")
        try:
            response = bedrock_runtime.invoke_model(
                modelId=settings.BEDROCK_EMBEDDING_MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=json.dumps({
                    "inputText": "This is a test embedding",
                    "normalize": True
                })
            )

            response_body = json.loads(response['body'].read())
            embedding = response_body.get('embedding')

            if embedding:
                print(f"✅ Embedding generated: {len(embedding)} dimensions")
                print(f"   First 5 values: {embedding[:5]}")
            else:
                print("❌ No embedding in response")

        except Exception as e:
            print(f"❌ Embedding model error: {e}")

        print("\n🎉 Bedrock connection test complete!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    test_bedrock_connection()
