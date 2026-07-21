def test_catalog_combines_all_resource_types(client):
    client.post("/v1/agents", json={"name": "a1", "namespace": "kagent", "system_message": "hi"})
    client.post(
        "/v1/mcp-servers", json={"name": "m1", "namespace": "kagent", "url": "http://x", "protocol": "SSE"}
    )
    client.post("/v1/model-configs", json={"name": "mc1", "namespace": "kagent", "model": "m"})

    resp = client.get("/v1/catalog")
    assert resp.status_code == 200
    body = resp.json()
    assert [a["name"] for a in body["agents"]] == ["a1"]
    assert [m["name"] for m in body["mcp_servers"]] == ["m1"]
    assert [m["name"] for m in body["model_configs"]] == ["mc1"]


def test_catalog_q_filter(client):
    client.post(
        "/v1/agents",
        json={"name": "weather-agent", "namespace": "kagent", "system_message": "hi", "tags": ["weather"]},
    )
    client.post("/v1/agents", json={"name": "other-agent", "namespace": "kagent", "system_message": "hi"})

    resp = client.get("/v1/catalog", params={"q": "weather"})
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()["agents"]]
    assert names == ["weather-agent"]


def test_catalog_q_filter_matches_mcp_discovered_tool(client, fake_k8s):
    client.post(
        "/v1/mcp-servers", json={"name": "m1", "namespace": "kagent", "url": "http://x", "protocol": "SSE"}
    )
    # Simulate the controller discovering a tool.
    key = ("remotemcpservers", "kagent", "m1")
    fake_k8s.store[key]["status"]["discoveredTools"] = [{"name": "get_weather", "description": "..."}]

    resp = client.get("/v1/catalog", params={"q": "get_weather"})
    assert [m["name"] for m in resp.json()["mcp_servers"]] == ["m1"]
