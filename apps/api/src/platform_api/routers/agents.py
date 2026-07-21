import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from platform_api import kagent_client, mappers
from platform_api.config import Settings, get_settings
from platform_api.k8s import K8sClient, PLURAL_AGENTS, get_k8s_client
from platform_api.schemas import AgentIn, AgentOut, InvokeIn, InvokeOut

router = APIRouter(prefix="/v1/agents", tags=["agents"])

K8sDep = Annotated[K8sClient, Depends(get_k8s_client)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=list[AgentOut])
def list_agents(
    k8s: K8sDep, settings: SettingsDep, namespace: str | None = Query(default=None)
) -> list[AgentOut]:
    ns = namespace or settings.default_namespace
    return [
        mappers.agent_from_crd(obj, settings.kagent_api_base) for obj in k8s.list(PLURAL_AGENTS, ns)
    ]


@router.post("", response_model=AgentOut, status_code=201)
def create_agent(agent: AgentIn, k8s: K8sDep, settings: SettingsDep) -> AgentOut:
    ns = agent.namespace or settings.default_namespace
    created = k8s.create(PLURAL_AGENTS, ns, mappers.agent_to_crd(agent, ns))
    return mappers.agent_from_crd(created, settings.kagent_api_base)


@router.get("/{namespace}/{name}", response_model=AgentOut)
def get_agent(namespace: str, name: str, k8s: K8sDep, settings: SettingsDep) -> AgentOut:
    obj = k8s.get(PLURAL_AGENTS, namespace, name)
    return mappers.agent_from_crd(obj, settings.kagent_api_base)


@router.put("/{namespace}/{name}", response_model=AgentOut)
def update_agent(
    namespace: str, name: str, agent: AgentIn, k8s: K8sDep, settings: SettingsDep
) -> AgentOut:
    existing = k8s.get(PLURAL_AGENTS, namespace, name)
    body = mappers.agent_to_crd(agent, namespace)
    body["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    updated = k8s.replace(PLURAL_AGENTS, namespace, name, body)
    return mappers.agent_from_crd(updated, settings.kagent_api_base)


@router.delete("/{namespace}/{name}", status_code=204)
def delete_agent(namespace: str, name: str, k8s: K8sDep) -> None:
    k8s.delete(PLURAL_AGENTS, namespace, name)


@router.get("/{namespace}/{name}/card")
async def get_agent_card(namespace: str, name: str) -> dict:
    return await kagent_client.get_agent_card(namespace, name)


@router.post("/{namespace}/{name}/invoke", response_model=InvokeOut)
async def invoke_agent(namespace: str, name: str, body: InvokeIn) -> InvokeOut:
    result = await kagent_client.invoke_agent(namespace, name, body.text, body.session_id)
    return InvokeOut(**result)


@router.post("/{namespace}/{name}/invoke/stream")
async def invoke_agent_stream(namespace: str, name: str, body: InvokeIn) -> StreamingResponse:
    async def sse() -> AsyncIterator[str]:
        async for event in kagent_client.stream_agent(namespace, name, body.text, body.session_id):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
