"""The single JSON error envelope used by every error response."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pnp_core.errors import PnpError
from starlette.exceptions import HTTPException as StarletteHTTPException

_PNP_STATUS = {
    "invalid_path": 400,
    "validation_error": 422,
    "scene_not_found": 404,
    "not_found": 404,
    "already_exists": 409,
    "conflict": 412,
    "payload_too_large": 413,
    "unsupported_file": 415,
    "storage_error": 409,
}
_HTTP_CODES = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def error_response(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "details": details}}
    return JSONResponse(body, status_code=status)


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc.status, exc.code, exc.message, exc.details)


async def _pnp_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, PnpError)
    return error_response(_PNP_STATUS.get(exc.code, 500), exc.code, str(exc))


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Only plain fields: pydantic's "ctx" may hold exception objects that are not JSON.
    details = [
        {"loc": list(e.get("loc", [])), "msg": e.get("msg", ""), "type": e.get("type", "")}
        for e in exc.errors()
    ]
    return error_response(422, "validation_error", "Request validation failed", details)


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _HTTP_CODES.get(exc.status_code, "http_error")
    return error_response(exc.status_code, code, str(exc.detail))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(PnpError, _pnp_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
