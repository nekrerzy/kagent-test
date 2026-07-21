from platform_api import mappers
from platform_api.schemas import AgentIn, McpServerIn, ToolRef


def test_tool_scopes_map_to_require_approval():
    agent = AgentIn(
        name="a",
        system_message="hi",
        tools=[
            ToolRef(
                mcp_server="srv",
                tool_names=["read", "write"],
                require_approval=["write"],
            )
        ],
    )
    crd = mappers.agent_to_crd(agent, "kagent")
    tool = crd["spec"]["declarative"]["tools"][0]["mcpServer"]
    assert tool["toolNames"] == ["read", "write"]
    assert tool["requireApproval"] == ["write"]

    crd["status"] = {}
    out = mappers.agent_from_crd(crd, a2a_base="http://gw")
    assert out.tools[0].require_approval == ["write"]


def test_mcp_auth_header_maps_to_secret_ref_and_never_echoes():
    mcp = McpServerIn(
        name="authed", url="http://x/mcp", auth_header="Authorization", auth_value="Bearer tok"
    )
    crd = mappers.mcp_server_to_crd(mcp, "kagent")
    assert crd["spec"]["headersFrom"] == [
        {
            "name": "Authorization",
            "valueFrom": {"type": "Secret", "name": "authed-mcp-auth", "key": "value"},
        }
    ]
    assert "tok" not in str(crd)

    crd["status"] = {}
    out = mappers.mcp_server_from_crd(crd)
    assert out.auth_header == "Authorization"
    assert out.auth_value is None


def test_mcp_create_with_auth_stores_secret(client, fake_k8s):
    resp = client.post(
        "/v1/mcp-servers",
        json={
            "name": "authed",
            "url": "http://x/mcp",
            "auth_header": "Authorization",
            "auth_value": "Bearer secret-token",
        },
    )
    assert resp.status_code == 201
    assert fake_k8s.secrets[("kagent", "authed-mcp-auth")] == {"value": "Bearer secret-token"}
    assert resp.json()["auth_value"] is None
    assert resp.json()["auth_header"] == "Authorization"


def test_agent_version_from_generation(client, fake_k8s):
    client.post("/v1/agents", json={"name": "va", "system_message": "hi"})
    fake_k8s.store[("agents", "kagent", "va")]["metadata"]["generation"] = 3
    resp = client.get("/v1/agents/kagent/va")
    assert resp.json()["version"] == 3


def test_environments_list_and_create(client, fake_k8s):
    fake_k8s.create(
        "modelconfigs",
        "kagent",
        {
            "apiVersion": "kagent.dev/v1alpha2",
            "kind": "ModelConfig",
            "metadata": {"name": "default-model-config", "namespace": "kagent"},
            "spec": {"model": "m", "provider": "OpenAI", "apiKeySecret": "kagent-openai"},
        },
    )
    fake_k8s.secrets[("kagent", "kagent-openai")] = {"OPENAI_API_KEY": "eA=="}

    resp = client.get("/v1/environments")
    assert resp.json() == [{"name": "kagent", "default": True}]

    resp = client.post("/v1/environments", json={"name": "staging"})
    assert resp.status_code == 201
    assert fake_k8s.namespaces["staging"] == {"platform.kagent.dev/environment": "true"}
    # model config + secret seeded into the new namespace
    assert ("kagent.dev", "modelconfigs", "staging", "default-model-config") in fake_k8s.objects
    assert fake_k8s.secrets[("staging", "kagent-openai")] == {"OPENAI_API_KEY": "eA=="}

    names = [e["name"] for e in client.get("/v1/environments").json()]
    assert names == ["kagent", "staging"]


def test_author_skill_pushes_skill_md(client, monkeypatch):
    pushed = {}

    def fake_push(registry, repository, tag, files):
        pushed.update(repository=repository, files=files)
        return f"{registry}/{repository}:{tag}"

    monkeypatch.setattr("platform_api.routers.skills.oci.push_image", fake_push)
    resp = client.post(
        "/v1/skills/author",
        json={"name": "authored", "skill_md": "---\nname: authored\n---\nBody", "tags": ["t"]},
    )
    assert resp.status_code == 201
    assert pushed["repository"] == "skills/authored"
    assert pushed["files"]["SKILL.md"].startswith(b"---")
    assert resp.json()["image"].startswith("10.20.0.1:5050/skills/authored:")
