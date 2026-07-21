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
