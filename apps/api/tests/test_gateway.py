from platform_api import gateway
from platform_api.config import Settings


def test_mcp_target_parses_url():
    t = gateway.mcp_target("srv", "http://srv.kagent.svc.cluster.local:3000/mcp", "STREAMABLE_HTTP")
    assert t == {
        "name": "srv",
        "static": {
            "host": "srv.kagent.svc.cluster.local",
            "port": 3000,
            "path": "/mcp",
            "protocol": "StreamableHTTP",
        },
    }


def test_mcp_target_defaults_and_sse():
    t = gateway.mcp_target("s", "https://example.com", "SSE")
    assert t["static"]["port"] == 443
    assert t["static"]["path"] == "/"
    assert t["static"]["protocol"] == "SSE"


def test_a2a_route_shape():
    route = gateway.a2a_route("kagent", "my-agent", "agentgateway-system", "platform-gw")
    rule = route["spec"]["rules"][0]
    assert rule["matches"][0]["path"]["value"] == "/a2a/kagent/my-agent"
    assert rule["filters"][0]["urlRewrite"]["path"]["replacePrefixMatch"] == "/"
    assert rule["backendRefs"][0]["name"] == "a2a-kagent-my-agent"
    assert route["spec"]["parentRefs"] == [{"name": "platform-gw"}]


def test_agent_lifecycle_reconciles_gateway_exposure(client, fake_k8s):
    client.post(
        "/v1/agents",
        json={"name": "gw-agent", "system_message": "hi"},
    )
    backend_key = (
        "agentgateway.dev",
        "agentgatewaybackends",
        "agentgateway-system",
        "a2a-kagent-gw-agent",
    )
    route_key = (
        "gateway.networking.k8s.io",
        "httproutes",
        "agentgateway-system",
        "a2a-kagent-gw-agent",
    )
    assert backend_key in fake_k8s.objects
    assert route_key in fake_k8s.objects
    assert fake_k8s.objects[backend_key]["spec"]["a2a"]["host"] == (
        "gw-agent.kagent.svc.cluster.local"
    )

    client.delete("/v1/agents/kagent/gw-agent")
    assert backend_key not in fake_k8s.objects
    assert route_key not in fake_k8s.objects


def test_mcp_lifecycle_reconciles_catalog_backend(client, fake_k8s):
    catalog_key = ("agentgateway.dev", "agentgatewaybackends", "agentgateway-system", "mcp-catalog")

    client.post("/v1/mcp-servers", json={"name": "one", "url": "http://one.kagent:3000/mcp"})
    targets = fake_k8s.objects[catalog_key]["spec"]["mcp"]["targets"]
    assert [t["name"] for t in targets] == ["one"]

    client.post(
        "/v1/mcp-servers",
        json={"name": "two", "url": "http://two.kagent:9000/sse", "protocol": "SSE"},
    )
    targets = fake_k8s.objects[catalog_key]["spec"]["mcp"]["targets"]
    assert sorted(t["name"] for t in targets) == ["one", "two"]
    assert {t["static"]["protocol"] for t in targets} == {"StreamableHTTP", "SSE"}

    client.delete("/v1/mcp-servers/kagent/one")
    client.delete("/v1/mcp-servers/kagent/two")
    # Last server removed -> catalog backend deleted entirely.
    assert catalog_key not in fake_k8s.objects


def test_agent_a2a_url_uses_gateway_base(client):
    resp = client.post("/v1/agents", json={"name": "url-agent", "system_message": "hi"})
    assert resp.json()["a2a_url"] == "http://10.20.0.101/a2a/kagent/url-agent"


def test_catalog_exposes_federated_endpoint(client):
    client.post("/v1/mcp-servers", json={"name": "one", "url": "http://one.kagent:3000/mcp"})
    resp = client.get("/v1/catalog")
    assert resp.json()["mcp_endpoint"] == "http://10.20.0.101/mcp"


def test_reconcile_uses_settings_namespace():
    settings = Settings(gateway_namespace="custom-ns")

    class Recorder:
        def __init__(self):
            self.calls = []

        def put_object(self, group, version, plural, namespace, body):
            self.calls.append(("put", plural, namespace, body["metadata"]["name"]))

        def delete_object(self, group, version, plural, namespace, name):
            self.calls.append(("delete", plural, namespace, name))

    rec = Recorder()
    gateway.reconcile_mcp_catalog(
        rec,
        settings,
        [{"metadata": {"name": "s"}, "spec": {"url": "http://s:1/mcp", "protocol": "SSE"}}],
    )
    assert rec.calls == [("put", "agentgatewaybackends", "custom-ns", "mcp-catalog")]
