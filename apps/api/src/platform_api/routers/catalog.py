from typing import Annotated

from fastapi import APIRouter, Depends, Query

from platform_api import mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import (
    K8sClient,
    PLURAL_AGENTS,
    PLURAL_MODEL_CONFIGS,
    PLURAL_REMOTE_MCP_SERVERS,
    get_k8s_client,
)
from platform_api.schemas import AgentOut, CatalogOut, McpServerOut, ModelConfigOut

router = APIRouter(prefix="/v1/catalog", tags=["catalog"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _matches(q: str, *fields: str | list[str] | None) -> bool:
    for field in fields:
        if field is None:
            continue
        haystacks = field if isinstance(field, list) else [field]
        if any(q in h.lower() for h in haystacks):
            return True
    return False


def _agent_matches(q: str, agent: AgentOut) -> bool:
    return _matches(q, agent.name, agent.description, agent.tags)


def _mcp_server_matches(q: str, mcp: McpServerOut) -> bool:
    return _matches(q, mcp.name, mcp.description, mcp.tags, [t.name for t in mcp.discovered_tools])


def _model_config_matches(q: str, mc: ModelConfigOut) -> bool:
    return _matches(q, mc.name, mc.model)


@router.get("", response_model=CatalogOut)
def get_catalog(
    k8s: K8sDep,
    settings: SettingsDep,
    q: str | None = Query(default=None),
    namespace: str | None = Query(default=None),
) -> CatalogOut:
    ns = namespace or settings.default_namespace

    agents = [
        mappers.agent_from_crd(obj, settings.kagent_api_base) for obj in k8s.list(PLURAL_AGENTS, ns)
    ]
    mcp_servers = [
        mappers.mcp_server_from_crd(obj) for obj in k8s.list(PLURAL_REMOTE_MCP_SERVERS, ns)
    ]
    model_configs = [
        mappers.model_config_from_crd(obj) for obj in k8s.list(PLURAL_MODEL_CONFIGS, ns)
    ]

    if q:
        q_lower = q.lower()
        agents = [a for a in agents if _agent_matches(q_lower, a)]
        mcp_servers = [m for m in mcp_servers if _mcp_server_matches(q_lower, m)]
        model_configs = [m for m in model_configs if _model_config_matches(q_lower, m)]

    return CatalogOut(agents=agents, mcp_servers=mcp_servers, model_configs=model_configs)
