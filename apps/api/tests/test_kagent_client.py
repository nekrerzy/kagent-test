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
                        {
                            "artifactId": "art-1",
                            "parts": [{"kind": "text", "text": "answer part 1"}],
                        },
                        {
                            "artifactId": "art-2",
                            "parts": [{"kind": "text", "text": "answer part 2"}],
                        },
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
        await kagent_client.invoke_agent(
            "kagent", "hello-agent", "hi", "ctx-99", client=http_client
        )

    assert captured["message"]["contextId"] == "ctx-99"


async def test_invoke_agent_jsonrpc_error_raises_502():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": "1",
                "error": {"code": -32000, "message": "agent not found"},
            },
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


def _sse_body(events: list[dict]) -> str:
    return "".join(f"data: {json.dumps(e)}\n\n" for e in events)


def _stream_client(body: str) -> httpx.AsyncClient:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=body))
    return httpx.AsyncClient(transport=transport, base_url="http://kagent.test")


def _agent_text_event(text: str, partial: bool | None, ctx: str = "ctx-1") -> dict:
    return {
        "jsonrpc": "2.0",
        "id": "x",
        "result": {
            "kind": "status-update",
            "contextId": ctx,
            "final": False,
            "status": {
                "message": {
                    "kind": "message",
                    "role": "agent",
                    "metadata": {"kagent_adk_partial": partial},
                    "parts": [{"kind": "text", "text": text}],
                }
            },
        },
    }


async def test_stream_agent_partial_chunks_accumulate_then_full_replaces():
    events = [
        _agent_text_event("Hel", True),
        _agent_text_event("lo!", True),
        _agent_text_event("Hello!", None),
    ]
    async with _stream_client(_sse_body(events)) as client:
        out = [e async for e in kagent_client.stream_agent("kagent", "a", "hi", client=client)]
    snapshots = [e["text"] for e in out if "text" in e and not e["done"]]
    assert snapshots == ["Hel", "Hello!", "Hello!"]
    assert out[-1] == {"text": "Hello!", "done": True, "context_id": "ctx-1"}


async def test_stream_agent_emits_tool_calls():
    tool_event = {
        "jsonrpc": "2.0",
        "id": "x",
        "result": {
            "kind": "status-update",
            "contextId": "ctx-1",
            "status": {
                "message": {
                    "kind": "message",
                    "role": "agent",
                    "parts": [
                        {
                            "kind": "data",
                            "data": {"name": "get-sum", "args": {"a": 1}},
                            "metadata": {"kagent_type": "function_call"},
                        }
                    ],
                }
            },
        },
    }
    async with _stream_client(_sse_body([tool_event])) as client:
        out = [e async for e in kagent_client.stream_agent("kagent", "a", "hi", client=client)]
    assert {"tool": "get-sum", "done": False} in out


async def test_stream_agent_jsonrpc_error_yields_error_event():
    events = [{"jsonrpc": "2.0", "id": "x", "error": {"code": -32000, "message": "boom"}}]
    async with _stream_client(_sse_body(events)) as client:
        out = [e async for e in kagent_client.stream_agent("kagent", "a", "hi", client=client)]
    assert out == [{"error": "kagent error: boom", "done": True}]
