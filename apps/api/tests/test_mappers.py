from platform_api import mappers
from platform_api.schemas import AgentIn, McpServerIn, ModelConfigIn, ToolRef


def test_agent_round_trip_minimal():
    agent_in = AgentIn(name="hello-agent", system_message="You are helpful.")
    crd = mappers.agent_to_crd(agent_in, namespace="kagent")

    assert crd["apiVersion"] == "kagent.dev/v1alpha2"
    assert crd["kind"] == "Agent"
    assert crd["metadata"] == {"name": "hello-agent", "namespace": "kagent"}
    assert crd["spec"]["type"] == "Declarative"
    assert crd["spec"]["declarative"]["systemMessage"] == "You are helpful."
    assert "tools" not in crd["spec"]["declarative"]
    assert "modelConfig" not in crd["spec"]["declarative"]

    crd["status"] = {}
    out = mappers.agent_from_crd(crd, kagent_api_base="http://kagent-controller.kagent.svc.cluster.local:8083")
    assert out.name == "hello-agent"
    assert out.namespace == "kagent"
    assert out.system_message == "You are helpful."
    assert out.tools == []
    assert out.tags == []
    assert out.ready is None
    assert out.a2a_url == "http://kagent-controller.kagent.svc.cluster.local:8083/api/a2a/kagent/hello-agent"


def test_agent_round_trip_full():
    agent_in = AgentIn(
        name="hello-agent",
        namespace="kagent",
        description="Phase 0 smoke-test agent.",
        system_message="Be helpful.",
        model_config="default-model-config",
        tools=[
            ToolRef(mcp_server="hello-mcp-server", tool_names=None),
            ToolRef(mcp_server="other-mcp-server", tool_names=["add", "echo"]),
        ],
        tags=["demo", "smoke-test"],
    )
    crd = mappers.agent_to_crd(agent_in, namespace="kagent")

    assert crd["spec"]["description"] == "Phase 0 smoke-test agent."
    assert crd["spec"]["declarative"]["modelConfig"] == "default-model-config"
    tools = crd["spec"]["declarative"]["tools"]
    assert tools[0] == {
        "type": "McpServer",
        "mcpServer": {"kind": "RemoteMCPServer", "apiGroup": "kagent.dev", "name": "hello-mcp-server"},
    }
    assert tools[1]["mcpServer"]["toolNames"] == ["add", "echo"]
    assert crd["metadata"]["annotations"] == {"platform.kagent.dev/tags": "demo,smoke-test"}

    out = mappers.agent_from_crd(crd, kagent_api_base="http://base:8083")
    assert out.description == "Phase 0 smoke-test agent."
    assert out.model_config_ref == "default-model-config"
    assert [t.mcp_server for t in out.tools] == ["hello-mcp-server", "other-mcp-server"]
    assert out.tools[0].tool_names is None
    assert out.tools[1].tool_names == ["add", "echo"]
    assert out.tags == ["demo", "smoke-test"]


def test_agent_from_crd_reads_ready_condition():
    crd = {
        "metadata": {"name": "a", "namespace": "ns"},
        "spec": {"type": "Declarative", "declarative": {"systemMessage": "hi"}},
        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
    }
    out = mappers.agent_from_crd(crd, kagent_api_base="http://base")
    assert out.ready is True

    crd["status"]["conditions"][0]["status"] = "False"
    out = mappers.agent_from_crd(crd, kagent_api_base="http://base")
    assert out.ready is False


def test_mcp_server_round_trip():
    mcp_in = McpServerIn(
        name="hello-mcp-server",
        namespace="kagent",
        description="Smoke-test MCP server",
        url="http://hello-mcp-server.kagent.svc.cluster.local:3000/mcp",
        protocol="STREAMABLE_HTTP",
        tags=["demo"],
    )
    crd = mappers.mcp_server_to_crd(mcp_in, namespace="kagent")

    assert crd["kind"] == "RemoteMCPServer"
    assert crd["spec"] == {
        "description": "Smoke-test MCP server",
        "protocol": "STREAMABLE_HTTP",
        "url": "http://hello-mcp-server.kagent.svc.cluster.local:3000/mcp",
    }
    assert crd["metadata"]["annotations"] == {"platform.kagent.dev/tags": "demo"}

    crd["status"] = {
        "conditions": [{"type": "Accepted", "status": "True"}],
        "discoveredTools": [{"name": "echo", "description": "Echoes input"}],
    }
    out = mappers.mcp_server_from_crd(crd)
    assert out.name == "hello-mcp-server"
    assert out.url == "http://hello-mcp-server.kagent.svc.cluster.local:3000/mcp"
    assert out.tags == ["demo"]
    assert out.ready is True
    assert out.discovered_tools[0].name == "echo"
    assert out.discovered_tools[0].description == "Echoes input"


def test_mcp_server_no_tags_no_annotation():
    mcp_in = McpServerIn(name="x", url="http://x", tags=[])
    crd = mappers.mcp_server_to_crd(mcp_in, namespace="kagent")
    assert "annotations" not in crd["metadata"]


def test_model_config_round_trip_with_api_key():
    mc_in = ModelConfigIn(
        name="default-model-config",
        namespace="kagent",
        provider="OpenAI",
        model="qwen3.6-35b-a3b",
        base_url="http://10.20.0.1:9292/v1",
        api_key="sk-local-dummy",
    )
    crd = mappers.model_config_to_crd(mc_in, namespace="kagent")

    assert crd["kind"] == "ModelConfig"
    assert crd["spec"]["model"] == "qwen3.6-35b-a3b"
    assert crd["spec"]["provider"] == "OpenAI"
    assert crd["spec"]["apiKeySecretRef"] == "default-model-config-apikey"
    assert crd["spec"]["apiKeySecretKey"] == "apiKey"
    assert crd["spec"]["openAI"] == {"baseUrl": "http://10.20.0.1:9292/v1"}
    # api_key itself must never appear in the CRD dict.
    assert "apiKey" not in crd["spec"]
    assert "api_key" not in crd["spec"]

    crd["status"] = {"conditions": [{"type": "Accepted", "status": "True"}]}
    out = mappers.model_config_from_crd(crd)
    assert out.name == "default-model-config"
    assert out.model == "qwen3.6-35b-a3b"
    assert out.base_url == "http://10.20.0.1:9292/v1"
    assert out.ready is True
    assert not hasattr(out, "api_key")


def test_model_config_without_api_key_has_no_secret_ref():
    mc_in = ModelConfigIn(name="x", model="m")
    crd = mappers.model_config_to_crd(mc_in, namespace="kagent")
    assert "apiKeySecretRef" not in crd["spec"]
    assert "apiKeySecretKey" not in crd["spec"]


def test_model_config_secret_name():
    assert mappers.model_config_secret_name("foo") == "foo-apikey"
