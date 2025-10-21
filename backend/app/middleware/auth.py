"""
JWT authentication middleware for AWS Cognito tokens.
"""
import httpx
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk
from jose.exceptions import JWTError
from app.core.config import settings

security = HTTPBearer()


class CognitoJWTAuth:
    """Cognito JWT token validator."""

    def __init__(self):
        self.region = settings.COGNITO_REGION
        self.user_pool_id = settings.COGNITO_USER_POOL_ID
        self.app_client_id = settings.COGNITO_APP_CLIENT_ID
        self.issuer = settings.COGNITO_ISSUER
        self.jwks_url = f"{self.issuer}/.well-known/jwks.json"
        self._jwks_cache: Optional[Dict[str, Any]] = None

    async def get_jwks(self) -> Dict[str, Any]:
        """Fetch JWKS from Cognito (cached)."""
        if self._jwks_cache:
            return self._jwks_cache

        async with httpx.AsyncClient() as client:
            response = await client.get(self.jwks_url)
            response.raise_for_status()
            self._jwks_cache = response.json()
            return self._jwks_cache

    async def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Verify and decode JWT token from Cognito.

        Args:
            token: JWT token string

        Returns:
            Decoded token payload

        Raises:
            HTTPException: If token is invalid
        """
        try:
            # Get JWKS
            jwks = await self.get_jwks()

            # Decode header to get kid
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")

            if not kid:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token: missing kid"
                )

            # Find matching key
            key = None
            for jwk_key in jwks.get("keys", []):
                if jwk_key.get("kid") == kid:
                    key = jwk_key
                    break

            if not key:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token: key not found"
                )

            # Verify and decode token
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.app_client_id,
                issuer=self.issuer,
                options={
                    "verify_signature": True,
                    "verify_aud": True,
                    "verify_iss": True,
                    "verify_exp": True,
                }
            )

            return payload

        except JWTError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Invalid token: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail=f"Token validation error: {str(e)}"
            )


# Singleton instance
cognito_auth = CognitoJWTAuth()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    Dependency to get current authenticated user from JWT token.

    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            return {"user_id": user["sub"]}
    """
    token = credentials.credentials
    payload = await cognito_auth.verify_token(token)
    return payload


async def get_current_user_id(
    user: Dict[str, Any] = Depends(get_current_user)
) -> str:
    """
    Dependency to get current user ID (Cognito sub).

    Usage:
        @app.get("/me")
        async def me(user_id: str = Depends(get_current_user_id)):
            return {"user_id": user_id}
    """
    return user["sub"]


async def require_admin(
    user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Dependency to require admin role.

    Usage:
        @app.delete("/admin/users/{user_id}")
        async def delete_user(
            user_id: str,
            admin: dict = Depends(require_admin)
        ):
            ...
    """
    # Check Cognito groups
    groups = user.get("cognito:groups", [])
    if "admin" not in groups:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return user
