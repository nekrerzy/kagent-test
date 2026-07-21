"""FastAPI app factory for the Agents Platform API."""

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, PLURAL_AGENTS, get_k8s_client
from platform_api.routers import agents, catalog, mcp_servers, model_configs


def create_app() -> FastAPI:
    app = FastAPI(
        title="Agents Platform API",
        version="0.1.0",
        description="Management and discovery surface over a kagent-backed Kubernetes cluster.",
    )

    # The portal runs on a different origin (portal.* vs api.*); without CORS
    # the browser blocks every response. Wide-open is deliberate for the
    # unauthenticated LAN-only MVP — revisit with Phase 5 auth.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(agents.router)
    app.include_router(mcp_servers.router)
    app.include_router(model_configs.router)
    app.include_router(catalog.router)

    @app.get("/healthz")
    def healthz(
        k8s: Annotated[K8sClient, Depends(get_k8s_client)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict:
        try:
            k8s.list(PLURAL_AGENTS, settings.default_namespace)
            kagent_reachable = True
        except Exception:
            kagent_reachable = False
        return {"status": "ok", "kagent_reachable": kagent_reachable}

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        # Never leak stack traces / internals to clients.
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    return app


app = create_app()
