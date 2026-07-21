from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

import logging

from platform_api import gateway, mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, PLURAL_REMOTE_MCP_SERVERS, get_k8s_client
from platform_api.mcp_probe import probe_mcp
from platform_api.schemas import McpProbeIn, McpProbeOut, McpServerIn, McpServerOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/mcp-servers", tags=["mcp-servers"])


def _sync_catalog(k8s, settings) -> None:
    """Mirror registered MCP servers into the federated gateway backend.
    Best-effort: registration state is the source of truth and a failed sync
    heals on the next mutation."""
    try:
        namespaces = [settings.default_namespace]
        try:
            namespaces += [
                ns
                for ns in k8s.list_namespaces("platform.kagent.dev/environment=true")
                if ns != settings.default_namespace
            ]
        except Exception:
            pass
        servers = [obj for ns in namespaces for obj in k8s.list(PLURAL_REMOTE_MCP_SERVERS, ns)]
        gateway.reconcile_mcp_catalog(k8s, settings, servers)
    except Exception:
        logger.exception("failed to reconcile the federated MCP catalog")


K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=list[McpServerOut])
def list_mcp_servers(
    k8s: K8sDep, settings: SettingsDep, namespace: str | None = Query(default=None)
) -> list[McpServerOut]:
    ns = namespace or settings.default_namespace
    return [mappers.mcp_server_from_crd(obj) for obj in k8s.list(PLURAL_REMOTE_MCP_SERVERS, ns)]


def _auth_headers(header: str | None, value: str | None) -> dict[str, str] | None:
    return {header: value} if header and value else None


@router.post("/validate", response_model=McpProbeOut)
async def validate_mcp_server(probe: McpProbeIn) -> McpProbeOut:
    result = await probe_mcp(
        probe.url, probe.protocol, headers=_auth_headers(probe.auth_header, probe.auth_value)
    )
    return McpProbeOut(**result)


@router.post("", response_model=McpServerOut, status_code=201)
async def create_mcp_server(
    mcp: McpServerIn,
    k8s: K8sDep,
    settings: SettingsDep,
    validate: bool = Query(default=True),
) -> McpServerOut:
    # Probe before creating so registrations that can't complete an MCP
    # handshake fail loudly here, not silently as a Not Ready CRD.
    # ?validate=false is the escape hatch (e.g. a server that isn't up yet).
    if validate:
        result = await probe_mcp(
            mcp.url, mcp.protocol, headers=_auth_headers(mcp.auth_header, mcp.auth_value)
        )
        if not result["reachable"]:
            raise HTTPException(
                status_code=422,
                detail=f"MCP server at {mcp.url} failed validation: {result['error']} "
                "(pass ?validate=false to register anyway)",
            )
    ns = mcp.namespace or settings.default_namespace
    if mcp.auth_header and mcp.auth_value:
        k8s.put_secret(ns, mappers.mcp_auth_secret_name(mcp.name), {"value": mcp.auth_value})
    created = k8s.create(PLURAL_REMOTE_MCP_SERVERS, ns, mappers.mcp_server_to_crd(mcp, ns))
    _sync_catalog(k8s, settings)
    return mappers.mcp_server_from_crd(created)


@router.get("/{namespace}/{name}", response_model=McpServerOut)
def get_mcp_server(namespace: str, name: str, k8s: K8sDep) -> McpServerOut:
    obj = k8s.get(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
    return mappers.mcp_server_from_crd(obj)


@router.put("/{namespace}/{name}", response_model=McpServerOut)
def update_mcp_server(
    namespace: str, name: str, mcp: McpServerIn, k8s: K8sDep, settings: SettingsDep
) -> McpServerOut:
    existing = k8s.get(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
    if mcp.auth_header and mcp.auth_value:
        k8s.put_secret(namespace, mappers.mcp_auth_secret_name(name), {"value": mcp.auth_value})
    body = mappers.mcp_server_to_crd(mcp, namespace)
    body["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    updated = k8s.replace(PLURAL_REMOTE_MCP_SERVERS, namespace, name, body)
    _sync_catalog(k8s, settings)
    return mappers.mcp_server_from_crd(updated)


@router.delete("/{namespace}/{name}", status_code=204)
def delete_mcp_server(namespace: str, name: str, k8s: K8sDep, settings: SettingsDep) -> None:
    k8s.delete(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
    _sync_catalog(k8s, settings)
