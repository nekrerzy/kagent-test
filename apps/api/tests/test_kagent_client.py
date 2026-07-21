import json

import httpx
import pytest
from fastapi import HTTPException

from platform_api import kagent_client


def _client_with(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url="http://kagent-controller.kagent.svc.cluster.local:8083",
        transport=httpx.MockTransport(handler),
    )


async def test_invoke_agent_message_shaped_result():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/a2a/kagent/hello-agent"
        payload = json.loads(request.content)
        assert payload["method"] == "message/send"
        assert payload["params"]["message"]["parts"] == [{"kind": "text", "text": "hi"}]
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": {
                    "role": "agent",
                    "parts": [{"kind": "text", "text": "hello back"}],
                    "contextId": "ctx-1",
                    "kind": "message",
                },
            },
        )

    async with _client_with(handler) as http_client:
        result = await kagent_client.invoke_agent("kagent", "hello-agent", "hi", client=http_client)

    assert result["text"] == "hello back"
    assert result["context_id"] == "ctx-1"
    assert result["task_id"] is None


async def test_invoke_agent_task_shaped_result_with_artifacts():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": "1",
                "result": {
                    "id": "task-1",
                    "contextId": "ctx-2",
                    "status": {"state": "completed"},
                    "artifacts": [
                        {"artifactId": "art-1", "parts": [{"kind": "text", "text": "answer part 1"}]},
                        {"artifactId": "art-2", "parts": [{"kind": "text", "text": "answer part 2"}]},
                    ],
                },
            },
        )

    async with _client_with(handler) as http_client:
        result = await kagent_client.invoke_agent("kagent", "hello-agent", "hi", client=http_client)

    assert result["text"] == "answer part 1\nanswer part 2"
    assert result["task_id"] == "task-1"
    assert result["context_id"] == "ctx-2"


async def test_invoke_agent_includes_context_id_when_session_given():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        captured["message"] = payload["params"]["message"]
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": "1", "result": {"parts": []}})

    async with _client_with(handler) as http_client:
        await kagent_client.invoke_agent("kagent", "hello-agent", "hi", "ctx-99", client=http_client)

    assert captured["message"]["contextId"] == "ctx-99"


async def test_invoke_agent_jsonrpc_error_raises_502():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": "1", "error": {"code": -32000, "message": "agent not found"}},
        )

    async with _client_with(handler) as http_client:
        with pytest.raises(HTTPException) as exc_info:
            await kagent_client.invoke_agent("kagent", "hello-agent", "hi", client=http_client)

    assert exc_info.value.status_code == 502
    assert "agent not found" in exc_info.value.detail


async def test_invoke_agent_http_error_raises_502():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal error")

    async with _client_with(handler) as http_client:
        with pytest.raises(HTTPException) as exc_info:
            await kagent_client.invoke_agent("kagent", "hello-agent", "hi", client=http_client)

    assert exc_info.value.status_code == 502


async def test_get_agent_card_happy_path():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/a2a/kagent/hello-agent/.well-known/agent-card.json"
        return httpx.Response(200, json={"name": "hello-agent", "url": "http://x"})

    async with _client_with(handler) as http_client:
        card = await kagent_client.get_agent_card("kagent", "hello-agent", client=http_client)

    assert card["name"] == "hello-agent"


async def test_get_agent_card_falls_back_to_agent_json():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("agent-card.json"):
            return httpx.Response(404)
        return httpx.Response(200, json={"name": "hello-agent"})

    async with _client_with(handler) as http_client:
        card = await kagent_client.get_agent_card("kagent", "hello-agent", client=http_client)

    assert card["name"] == "hello-agent"
    assert calls == [
        "/api/a2a/kagent/hello-agent/.well-known/agent-card.json",
        "/api/a2a/kagent/hello-agent/.well-known/agent.json",
    ]
