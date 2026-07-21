def test_create_and_get_agent(client):
    payload = {
        "name": "hello-agent",
        "namespace": "kagent",
        "description": "Smoke test agent",
        "system_message": "Be helpful.",
        "model_config": "default-model-config",
        "tools": [{"mcp_server": "hello-mcp-server", "tool_names": None}],
        "tags": ["demo"],
    }
    resp = client.post("/v1/agents", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "hello-agent"
    assert body["model_config"] == "default-model-config"
    assert body["a2a_url"].endswith("/api/a2a/kagent/hello-agent")

    resp = client.get("/v1/agents/kagent/hello-agent")
    assert resp.status_code == 200
    assert resp.json()["name"] == "hello-agent"


def test_list_agents_defaults_to_default_namespace(client):
    client.post(
        "/v1/agents",
        json={"name": "a1", "system_message": "hi"},
    )
    resp = client.get("/v1/agents")
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert names == ["a1"]


def test_get_agent_not_found(client):
    resp = client.get("/v1/agents/kagent/does-not-exist")
    assert resp.status_code == 404
    assert "detail" in resp.json()


def test_update_agent(client):
    client.post("/v1/agents", json={"name": "a1", "namespace": "kagent", "system_message": "v1"})
    resp = client.put(
        "/v1/agents/kagent/a1",
        json={"name": "a1", "namespace": "kagent", "system_message": "v2"},
    )
    assert resp.status_code == 200
    assert resp.json()["system_message"] == "v2"


def test_delete_agent(client):
    client.post("/v1/agents", json={"name": "a1", "namespace": "kagent", "system_message": "hi"})
    resp = client.delete("/v1/agents/kagent/a1")
    assert resp.status_code == 204
    resp = client.get("/v1/agents/kagent/a1")
    assert resp.status_code == 404


def test_create_agent_conflict(client):
    client.post("/v1/agents", json={"name": "a1", "namespace": "kagent", "system_message": "hi"})
    resp = client.post("/v1/agents", json={"name": "a1", "namespace": "kagent", "system_message": "hi"})
    assert resp.status_code == 409
