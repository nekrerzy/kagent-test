from typing import Annotated

from fastapi import APIRouter, Depends, Query

from platform_api import mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, PLURAL_REMOTE_MCP_SERVERS, get_k8s_client
from platform_api.schemas import McpServerIn, McpServerOut

router = APIRouter(prefix="/v1/mcp-servers", tags=["mcp-servers"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=list[McpServerOut])
def list_mcp_servers(
    k8s: K8sDep, settings: SettingsDep, namespace: str | None = Query(default=None)
) -> list[McpServerOut]:
    ns = namespace or settings.default_namespace
    return [mappers.mcp_server_from_crd(obj) for obj in k8s.list(PLURAL_REMOTE_MCP_SERVERS, ns)]


@router.post("", response_model=McpServerOut, status_code=201)
def create_mcp_server(mcp: McpServerIn, k8s: K8sDep, settings: SettingsDep) -> McpServerOut:
    ns = mcp.namespace or settings.default_namespace
    created = k8s.create(PLURAL_REMOTE_MCP_SERVERS, ns, mappers.mcp_server_to_crd(mcp, ns))
    return mappers.mcp_server_from_crd(created)


@router.get("/{namespace}/{name}", response_model=McpServerOut)
def get_mcp_server(namespace: str, name: str, k8s: K8sDep) -> McpServerOut:
    obj = k8s.get(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
    return mappers.mcp_server_from_crd(obj)


@router.put("/{namespace}/{name}", response_model=McpServerOut)
def update_mcp_server(namespace: str, name: str, mcp: McpServerIn, k8s: K8sDep) -> McpServerOut:
    existing = k8s.get(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
    body = mappers.mcp_server_to_crd(mcp, namespace)
    body["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    updated = k8s.replace(PLURAL_REMOTE_MCP_SERVERS, namespace, name, body)
    return mappers.mcp_server_from_crd(updated)


@router.delete("/{namespace}/{name}", status_code=204)
def delete_mcp_server(namespace: str, name: str, k8s: K8sDep) -> None:
    k8s.delete(PLURAL_REMOTE_MCP_SERVERS, namespace, name)
