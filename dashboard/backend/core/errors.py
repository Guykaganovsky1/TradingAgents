"""Custom exception classes and FastAPI exception handlers."""
from __future__ import annotations

import logging
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("dashboard.errors")


class NotFoundError(Exception):
    def __init__(self, resource: str, id: str | int):
        self.resource = resource
        self.id = id
        super().__init__(f"{resource} {id} not found")


class ValidationError(Exception):
    def __init__(self, message: str):
        super().__init__(message)


class ConflictError(Exception):
    def __init__(self, message: str):
        super().__init__(message)


def _make_error_response(status_code: int, detail: str) -> JSONResponse:
    correlation_id = str(uuid.uuid4())
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "correlation_id": correlation_id},
    )


async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    logger.warning("Not found: %s %s", exc.resource, exc.id)
    return _make_error_response(404, f"{exc.resource} not found")


async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    logger.warning("Validation error: %s", exc)
    return _make_error_response(422, str(exc))


async def conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    logger.warning("Conflict: %s", exc)
    return _make_error_response(409, str(exc))


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = str(uuid.uuid4())
    logger.exception("Unhandled error [%s]: %s", correlation_id, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "correlation_id": correlation_id,
        },
    )
