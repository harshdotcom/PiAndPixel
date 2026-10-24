"""Host/Origin checks and bearer-token auth, applied to every request before routing."""

import hmac
import re
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response, WebSocket

from pnp_agent.errors import error_response
from pnp_agent.settings import Settings

# Artifact media is fetched by <video>/<a>, which cannot send headers; it uses a signature.
_SIGNED_PATH = re.compile(r"^/api/v1/artifacts/[^/]+/(stream|download)$")
_HEALTH_PATH = "/api/v1/agent/health"
MAX_BODY_BYTES = 1_000_000


def allowed_hosts(settings: Settings) -> set[str]:
    port = settings.port
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}", f"{settings.host}:{port}"}
    if settings.testing:
        hosts.add("testserver")
    return hosts


def allowed_origins(settings: Settings) -> set[str]:
    return {f"http://{h}" for h in allowed_hosts(settings)} | set(settings.allowed_origins)


# Close codes sent before accepting a refused WebSocket handshake.
WS_UNAUTHORIZED = 4401
WS_FORBIDDEN = 4403
WS_NOT_FOUND = 4404


def websocket_denial(websocket: WebSocket, settings: Settings) -> int | None:
    """Close code for a WebSocket that must be refused, or None when it may be accepted.

    Browsers cannot set headers on a WebSocket, so the token comes as ?token=. That is
    accepted only here, and only with an allowed Origin, so other sites cannot use it.
    """
    if websocket.headers.get("host", "") not in allowed_hosts(settings):
        return WS_FORBIDDEN
    if websocket.headers.get("origin") not in allowed_origins(settings):
        return WS_FORBIDDEN
    token = websocket.query_params.get("token", "")
    if not settings.token or not hmac.compare_digest(token.encode(), settings.token.encode()):
        return WS_UNAUTHORIZED
    return None


def sign_artifact(token: str, artifact_id: str) -> str:
    return hmac.new(token.encode(), artifact_id.encode(), "sha256").hexdigest()


def verify_artifact_sig(token: str, artifact_id: str, sig: str) -> bool:
    return hmac.compare_digest(sign_artifact(token, artifact_id), sig)


def _needs_token(request: Request) -> bool:
    path = request.url.path
    if not path.startswith("/api/v1/") and path != "/api/v1":
        return False
    if path == _HEALTH_PATH and request.method == "GET":
        return False
    return not _SIGNED_PATH.match(path)


def _has_valid_token(request: Request, token: str) -> bool:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(value.strip().encode(), token.encode())


def _body_size_error(request: Request) -> Response | None:
    length = request.headers.get("content-length")
    if length is None and "chunked" in request.headers.get("transfer-encoding", "").lower():
        # A body without a declared length could be any size; browsers always declare it.
        return error_response(411, "length_required", "Request body needs a Content-Length")
    if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        message = f"Request body is larger than {MAX_BODY_BYTES} bytes"
        return error_response(413, "payload_too_large", message)
    return None


def install_security(app: FastAPI, settings: Settings) -> None:
    hosts = allowed_hosts(settings)
    origins = allowed_origins(settings)

    @app.middleware("http")
    async def guard(  # pyright: ignore[reportUnusedFunction]
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # The Host check blocks DNS rebinding; the Origin check blocks other sites' pages.
        if request.headers.get("host", "") not in hosts:
            return error_response(403, "forbidden_origin", "Host header not allowed")
        origin = request.headers.get("origin")
        if origin is not None and origin not in origins:
            return error_response(403, "forbidden_origin", "Origin not allowed")
        if _needs_token(request) and not _has_valid_token(request, settings.token):
            return error_response(401, "unauthorized", "Missing or invalid bearer token")
        return _body_size_error(request) or await call_next(request)
