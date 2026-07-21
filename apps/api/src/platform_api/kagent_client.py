"""The only module allowed to call kagent's controller HTTP API directly.

kagent's controller REST API has no OpenAPI spec and no stability contract
(see IMPLEMENTATION_PLAN.md §2 / §6 "Adapter isolation") — everything else in
this service talks to the Kubernetes CRD API instead. This module is isolated
so a kagent version bump that changes these endpoints breaks in one place.

Endpoints and A2A JSON-RPC shapes per the platform spec:
  - agent card: GET {base}/api/a2a/{ns}/{name}/.well-known/agent-card.json
    (fall back to .../agent.json for older kagent AgentCard hosting)
  - invoke: POST {base}/api/a2a/{ns}/{name}, JSON-RPC 2.0 "message/send"
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import HTTPException

from platform_api.config import get_settings

TIMEOUT = httpx.Timeout(120.0)


def _client_for(namespace: str, client: httpx.AsyncClient | None) -> tuple[httpx.AsyncClient, bool]:
    """Return (client, owns_client). If a client isn't injected (production
    use), build one from settings; tests inject a MockTransport-backed client.
    """
    if client is not None:
        return client, False
    return httpx.AsyncClient(base_url=get_settings().kagent_api_base, timeout=TIMEOUT), True


async def get_agent_card(
    namespace: str, name: str, *, client: httpx.AsyncClient | None = None
) -> dict[str, Any]:
    http_client, owns_client = _client_for(namespace, client)
    try:
        resp = await http_client.get(f"/api/a2a/{namespace}/{name}/.well-known/agent-card.json")
        if resp.status_code == 404:
            resp = await http_client.get(f"/api/a2a/{namespace}/{name}/.well-known/agent.json")
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"kagent agent card fetch failed: HTTP {resp.status_code}",
            )
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"kagent request failed: {exc}") from exc
    finally:
        if owns_client:
            await http_client.aclose()


async def invoke_agent(
    namespace: str,
    name: str,
    text: str,
    session_id: str | None = None,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    message: dict[str, Any] = {
        "role": "user",
        "parts": [{"kind": "text", "text": text}],
        "messageId": str(uuid.uuid4()),
        "kind": "message",
    }
    if session_id:
        message["contextId"] = session_id

    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "message/send",
        "params": {"message": message},
    }

    http_client, owns_client = _client_for(namespace, client)
    try:
        try:
            resp = await http_client.post(f"/api/a2a/{namespace}/{name}", json=payload)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"kagent request failed: {exc}") from exc

        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502, detail=f"kagent invoke failed: HTTP {resp.status_code}"
            )

        data = resp.json()
        error = data.get("error")
        if error:
            raise HTTPException(status_code=502, detail=f"kagent error: {error.get('message', error)}")

        return _parse_result(data.get("result") or {})
    finally:
        if owns_client:
            await http_client.aclose()


def _parse_result(result: dict[str, Any]) -> dict[str, Any]:
    """A2A message/send results are either Task-shaped (top-level `artifacts`,
    each with `parts`) or Message-shaped (top-level `parts` directly).
    """
    parts_groups: list[list[dict[str, Any]]] = []
    for artifact in result.get("artifacts") or []:
        parts_groups.append(artifact.get("parts") or [])
    if "parts" in result:
        parts_groups.append(result.get("parts") or [])

    texts = [part.get("text", "") for parts in parts_groups for part in parts if part.get("kind") == "text"]

    return {
        "text": "\n".join(t for t in texts if t),
        "task_id": result.get("id"),
        "context_id": result.get("contextId"),
        "raw": result,
    }
