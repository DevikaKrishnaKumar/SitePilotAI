
import hmac
import os
import secrets
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from pwdlib import PasswordHash


# Load configuration from the SitePilot AI project root.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "")
SESSION_COOKIE_SECURE = (
    os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
)
SESSION_MAX_AGE_SECONDS = int(
    os.getenv("SESSION_MAX_AGE_SECONDS", "28800")
)

# Fail immediately if authentication configuration is incomplete.
if not ADMIN_USERNAME:
    raise RuntimeError("ADMIN_USERNAME is missing from the environment.")

if not ADMIN_PASSWORD_HASH.startswith("$argon2"):
    raise RuntimeError("ADMIN_PASSWORD_HASH must be an Argon2 hash.")

if len(SESSION_SECRET_KEY) < 32:
    raise RuntimeError("SESSION_SECRET_KEY must contain at least 32 characters.")

if SESSION_MAX_AGE_SECONDS < 300:
    raise RuntimeError("SESSION_MAX_AGE_SECONDS must be at least 300 seconds.")

SESSION_COOKIE_NAME = "sitepilot_session"
CSRF_COOKIE_NAME = "sitepilot_csrf"

serializer = URLSafeTimedSerializer(
    SESSION_SECRET_KEY,
    salt="sitepilot-admin-session-v1",
)
password_hasher = PasswordHash.recommended()

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


def get_session_username(request: Request) -> str | None:
    """Return the authenticated username, or None for an invalid session."""
    token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        return None

    try:
        payload = serializer.loads(
            token,
            max_age=SESSION_MAX_AGE_SECONDS,
        )
    except (BadSignature, ValueError, TypeError):
        return None

    username = payload.get("username") if isinstance(payload, dict) else None

    if not isinstance(username, str):
        return None

    if not hmac.compare_digest(username, ADMIN_USERNAME):
        return None

    return username


def require_csrf(request: Request) -> None:
    """Validate the CSRF token for state-changing requests."""
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get("X-CSRF-Token")

    if (
        not cookie_token
        or not header_token
        or not hmac.compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


@router.post("/login")
def login(data: LoginRequest, request: Request, response: Response):
    # Only allow browser requests from the configured frontend origin.
    origin = request.headers.get("origin")
    if origin != "http://localhost:5173":
        raise HTTPException(status_code=403, detail="Invalid request origin")

    username_matches = hmac.compare_digest(data.username, ADMIN_USERNAME)

    try:
        password_matches = password_hasher.verify(
            data.password,
            ADMIN_PASSWORD_HASH,
        )
    except Exception:
        password_matches = False

    if not username_matches or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session_token = serializer.dumps({"username": ADMIN_USERNAME})
    csrf_token = secrets.token_urlsafe(32)

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=False,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )

    return {
        "authenticated": True,
        "username": ADMIN_USERNAME,
        "csrf_token": csrf_token,
        "expires_in": SESSION_MAX_AGE_SECONDS,
    }


@router.get("/me")
def current_user(request: Request):
    username = get_session_username(request)

    if username is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    csrf_token = request.cookies.get(CSRF_COOKIE_NAME)

    if not csrf_token:
        raise HTTPException(status_code=403, detail="CSRF token missing")

    return {
        "authenticated": True,
        "username": username,
        "csrf_token": csrf_token,
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    if get_session_username(request) is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    require_csrf(request)

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        secure=SESSION_COOKIE_SECURE,
        httponly=False,
        samesite="lax",
    )

    return {"authenticated": False, "message": "Logged out"}
