"""Minimal BYO agent: speaks just enough A2A for kagent to host it.

kagent's BYO contract: serve the A2A protocol on port 8080 with an AgentCard
at /.well-known/agent-card.json. This one echoes messages back — it exists to
prove the platform's BYO path without any agent framework.
"""

import uuid

from fastapi import FastAPI, Request

app = FastAPI()

CARD = {
    "name": "byo_echo_agent",
    "description": "Example BYO agent: echoes your message back over A2A.",
    "version": "0.1.0",
    "capabilities": {"streaming": False},
    "defaultInputModes": ["text"],
    "defaultOutputModes": ["text"],
    "skills": [],
}


@app.get("/.well-known/agent-card.json")
@app.get("/.well-known/agent.json")
def agent_card() -> dict:
    return CARD


@app.post("/")
async def a2a(request: Request) -> dict:
    body = await request.json()
    if body.get("method") not in ("message/send", "message/stream"):
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "error": {"code": -32601, "message": f"unsupported method {body.get('method')}"},
        }
    parts = (body.get("params", {}).get("message") or {}).get("parts") or []
    text = " ".join(p.get("text", "") for p in parts if p.get("kind") == "text")
    return {
        "jsonrpc": "2.0",
        "id": body.get("id"),
        "result": {
            "kind": "message",
            "role": "agent",
            "messageId": str(uuid.uuid4()),
            "parts": [{"kind": "text", "text": f"BYO echo: {text}"}],
        },
    }
