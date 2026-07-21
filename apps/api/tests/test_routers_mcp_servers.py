def test_create_list_get_mcp_server(client):
    payload = {
        "name": "hello-mcp-server",
        "namespace": "kagent",
        "description": "Smoke-test MCP server",
        "url": "http://hello-mcp-server.kagent.svc.cluster.local:3000/mcp",
        "protocol": "STREAMABLE_HTTP",
        "tags": ["demo"],
    }
    resp = client.post("/v1/mcp-servers", json=payload)
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "hello-mcp-server"
    assert resp.json()["discovered_tools"] == []

    resp = client.get("/v1/mcp-servers")
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = client.get("/v1/mcp-servers/kagent/hello-mcp-server")
    assert resp.status_code == 200


def test_update_and_delete_mcp_server(client):
    client.post(
        "/v1/mcp-servers",
        json={"name": "m1", "namespace": "kagent", "url": "http://a", "protocol": "SSE"},
    )
    resp = client.put(
        "/v1/mcp-servers/kagent/m1",
        json={"name": "m1", "namespace": "kagent", "url": "http://b", "protocol": "SSE"},
    )
    assert resp.status_code == 200
    assert resp.json()["url"] == "http://b"

    resp = client.delete("/v1/mcp-servers/kagent/m1")
    assert resp.status_code == 204
    resp = client.get("/v1/mcp-servers/kagent/m1")
    assert resp.status_code == 404


def test_create_rejects_unreachable_mcp_server(client, monkeypatch):
    async def failing_probe(url: str, protocol: str, headers=None) -> dict:
        return {"reachable": False, "tools": [], "error": "connection refused"}

    monkeypatch.setattr("platform_api.routers.mcp_servers.probe_mcp", failing_probe)
    resp = client.post("/v1/mcp-servers", json={"name": "down", "url": "http://down:1/mcp"})
    assert resp.status_code == 422
    assert "connection refused" in resp.json()["detail"]

    # Escape hatch: register anyway without probing.
    resp = client.post(
        "/v1/mcp-servers?validate=false", json={"name": "down", "url": "http://down:1/mcp"}
    )
    assert resp.status_code == 201


def test_validate_endpoint_reports_probe_result(client, monkeypatch):
    async def probe(url: str, protocol: str, headers=None) -> dict:
        return {
            "reachable": True,
            "tools": [{"name": "echo", "description": "Echoes"}],
            "error": None,
        }

    monkeypatch.setattr("platform_api.routers.mcp_servers.probe_mcp", probe)
    resp = client.post("/v1/mcp-servers/validate", json={"url": "http://x/mcp"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reachable"] is True
    assert body["tools"][0]["name"] == "echo"
