"""
Amazon Bedrock service for chat inference and embeddings.
Supports streaming responses with SSE.
"""
import json
import boto3
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.config import settings


class BedrockService:
    """Service for interacting with Amazon Bedrock."""

    def __init__(self):
        self.runtime_client = boto3.client(
            "bedrock-runtime",
            region_name=settings.BEDROCK_REGION
        )
        self.bedrock_client = boto3.client(
            "bedrock",
            region_name=settings.BEDROCK_REGION
        )

    async def invoke_model_stream(
        self,
        messages: List[Dict[str, str]],
        model_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream model responses using Bedrock Converse API.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model_id: Bedrock model ID (defaults to settings)
            system_prompt: System instructions
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate

        Yields:
            Text chunks as they arrive from the model
        """
        model_id = model_id or settings.BEDROCK_MODEL_ID
        temperature = temperature if temperature is not None else settings.BEDROCK_TEMPERATURE
        max_tokens = max_tokens or settings.BEDROCK_MAX_TOKENS

        # Prepare request
        request_body = {
            "messages": messages,
            "inferenceConfig": {
                "temperature": temperature,
                "maxTokens": max_tokens,
            }
        }

        if system_prompt:
            request_body["system"] = [{"text": system_prompt}]

        # Invoke streaming
        try:
            response = self.runtime_client.converse_stream(
                modelId=model_id,
                **request_body
            )

            # Process stream
            for event in response.get("stream", []):
                if "contentBlockDelta" in event:
                    delta = event["contentBlockDelta"]["delta"]
                    if "text" in delta:
                        yield delta["text"]
                elif "metadata" in event:
                    # Final metadata (usage stats, etc.)
                    metadata = event["metadata"]
                    # Can log usage here if needed
                    pass

        except Exception as e:
            yield f"[ERROR] {str(e)}"

    async def invoke_model(
        self,
        messages: List[Dict[str, str]],
        model_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Non-streaming inference for simple use cases.

        Returns:
            Dict with 'content', 'stop_reason', and 'usage'
        """
        model_id = model_id or settings.BEDROCK_MODEL_ID
        temperature = temperature if temperature is not None else settings.BEDROCK_TEMPERATURE
        max_tokens = max_tokens or settings.BEDROCK_MAX_TOKENS

        request_body = {
            "messages": messages,
            "inferenceConfig": {
                "temperature": temperature,
                "maxTokens": max_tokens,
            }
        }

        if system_prompt:
            request_body["system"] = [{"text": system_prompt}]

        try:
            response = self.runtime_client.converse(
                modelId=model_id,
                **request_body
            )

            content = response["output"]["message"]["content"][0]["text"]
            stop_reason = response["stopReason"]
            usage = response["usage"]

            return {
                "content": content,
                "stop_reason": stop_reason,
                "usage": usage,
                "model_id": model_id
            }

        except Exception as e:
            raise Exception(f"Bedrock inference error: {str(e)}")

    async def generate_embeddings(
        self,
        texts: List[str],
        model_id: Optional[str] = None,
        normalize: bool = True
    ) -> List[List[float]]:
        """
        Generate embeddings using Bedrock Titan Embeddings.

        Args:
            texts: List of text strings to embed
            model_id: Embedding model ID
            normalize: Whether to normalize vectors

        Returns:
            List of embedding vectors
        """
        model_id = model_id or settings.BEDROCK_EMBEDDING_MODEL_ID
        embeddings = []

        try:
            for text in texts:
                request_body = {
                    "inputText": text,
                    "normalize": normalize
                }

                response = self.runtime_client.invoke_model(
                    modelId=model_id,
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(request_body)
                )

                response_body = json.loads(response["body"].read())
                embedding = response_body.get("embedding")

                if embedding:
                    embeddings.append(embedding)
                else:
                    raise ValueError(f"No embedding returned for text: {text[:50]}...")

            return embeddings

        except Exception as e:
            raise Exception(f"Bedrock embeddings error: {str(e)}")

    def list_available_models(self) -> List[Dict[str, Any]]:
        """
        List available Bedrock models.

        Returns:
            List of model information dicts
        """
        try:
            response = self.bedrock_client.list_foundation_models()
            models = response.get("modelSummaries", [])
            return [
                {
                    "model_id": model["modelId"],
                    "model_name": model.get("modelName"),
                    "provider": model.get("providerName"),
                    "inference_types": model.get("inferenceTypesSupported", []),
                }
                for model in models
            ]
        except Exception as e:
            raise Exception(f"Error listing models: {str(e)}")


# Singleton instance
bedrock_service = BedrockService()
