"""
API Versioning Support

Provides:
- Version prefix routing (/api/v1/, /api/v2/)
- Version negotiation via headers
- Deprecation warnings
- Version documentation

Current Versions:
- v1: Current stable API (default)
- v2: Reserved for future breaking changes
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, Header
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# =============================================================================
# API Version Configuration
# =============================================================================

API_VERSIONS = {
    "v1": {
        "status": "stable",
        "deprecated": False,
        "sunset_date": None,
        "description": "Current stable API version",
    },
    # "v2": {
    #     "status": "beta",
    #     "deprecated": False,
    #     "sunset_date": None,
    #     "description": "Next major API version (in development)",
    # },
}

DEFAULT_VERSION = "v1"
SUPPORTED_VERSIONS = list(API_VERSIONS.keys())


# =============================================================================
# Version Router Factory
# =============================================================================


def create_versioned_router(version: str = "v1") -> APIRouter:
    """
    Create a router with version prefix.

    Args:
        version: API version (v1, v2, etc.)

    Returns:
        APIRouter with version prefix
    """
    if version not in SUPPORTED_VERSIONS:
        raise ValueError(f"Unsupported API version: {version}")

    return APIRouter(
        prefix=f"/api/{version}",
        tags=[f"API {version.upper()}"],
    )


# =============================================================================
# Version Detection Middleware
# =============================================================================


def get_api_version(
    request: Request,
    x_api_version: Optional[str] = Header(None, alias="X-API-Version"),
    accept_version: Optional[str] = Header(None, alias="Accept-Version"),
) -> str:
    """
    Determine API version from request.

    Priority:
    1. URL path (/api/v1/...)
    2. X-API-Version header
    3. Accept-Version header
    4. Default version
    """
    # Check URL path
    path = request.url.path
    for version in SUPPORTED_VERSIONS:
        if f"/api/{version}/" in path or path.endswith(f"/api/{version}"):
            return version

    # Check headers
    if x_api_version and x_api_version in SUPPORTED_VERSIONS:
        return x_api_version

    if accept_version and accept_version in SUPPORTED_VERSIONS:
        return accept_version

    return DEFAULT_VERSION


def add_version_headers(response: JSONResponse, version: str) -> JSONResponse:
    """Add API version headers to response."""
    version_info = API_VERSIONS.get(version, {})

    response.headers["X-API-Version"] = version

    if version_info.get("deprecated"):
        response.headers["X-API-Deprecated"] = "true"
        if version_info.get("sunset_date"):
            response.headers["Sunset"] = version_info["sunset_date"]

    return response


# =============================================================================
# Version Info Endpoint
# =============================================================================


def get_version_info() -> dict:
    """
    Get information about all API versions.

    Returns:
        Dict with version information
    """
    return {
        "current_version": DEFAULT_VERSION,
        "supported_versions": SUPPORTED_VERSIONS,
        "versions": {
            version: {
                "status": info["status"],
                "deprecated": info["deprecated"],
                "sunset_date": info.get("sunset_date"),
                "description": info["description"],
            }
            for version, info in API_VERSIONS.items()
        },
    }


# =============================================================================
# Deprecation Warning Helper
# =============================================================================


def deprecation_warning(
    endpoint: str, replacement: Optional[str] = None, sunset_date: Optional[str] = None
) -> dict:
    """
    Generate deprecation warning message.

    Args:
        endpoint: Deprecated endpoint path
        replacement: New endpoint to use instead
        sunset_date: Date when endpoint will be removed

    Returns:
        Warning dict to include in response
    """
    warning = {
        "deprecated": True,
        "message": f"The endpoint '{endpoint}' is deprecated.",
    }

    if replacement:
        warning["replacement"] = replacement
        warning["message"] += f" Please use '{replacement}' instead."

    if sunset_date:
        warning["sunset_date"] = sunset_date
        warning["message"] += f" This endpoint will be removed on {sunset_date}."

    return warning
