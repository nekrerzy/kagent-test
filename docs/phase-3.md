# Phase 3 — agentgateway integration

All agentic traffic now transits the `platform-gw` Gateway (class `agentgateway`,
MetalLB `10.20.0.101`). Schema ground truth for everything below: the live
`agentgateway.dev/v1alpha1` CRDs (`kubectl get crd agentgatewaybackends.agentgateway.dev -o json`
— note the Backend spec keys: `mcp.targets[].static{host,port,path,protocol}`,
`ai.provider{openai,host,port}`, `a2a{host,port}`).

## What routes where

| Path on 10.20.0.101 | Backing | Owner |
|---|---|---|
| `/mcp` | `AgentgatewayBackend/mcp-catalog` — one federated MCP endpoint multiplexing every registered `RemoteMCPServer` (tools namespaced per server) | **Backend: platform API** (rewritten on every MCP server create/update/delete); route: git (`examples/gateway/mcp-catalog-route.yaml`) |
| `/a2a/{ns}/{name}` | per-agent `AgentgatewayBackend` + `HTTPRoute` (URLRewrite strips the prefix; agent Service port 8080) | platform API — created on agent create/update, garbage-collected on delete |
| `/v1` | `AgentgatewayBackend/llm-local` → llama-swap `10.20.0.1:9292`; kagent's `default-model-config` baseUrl points here (`infra/kagent/values.yaml`), so every agent LLM call is logged with `gen_ai.*` token/latency telemetry | git (`examples/gateway/llm-egress.yaml`) |

## Sharp edges hit while building this

- **Never name a Gateway after the agentgateway chart release** (`agentgateway`
  in `agentgateway-system`): the controller derives the proxy Deployment/Service
  names from the Gateway name, collides with its own control plane
  (immutable-selector apply loop; proxy never starts) and half-adopts the
  chart's Service/ServiceAccount. Hence `platform-gw`.
- The control-plane pod crashloops with `Unauthorized` if it started while its
  ServiceAccount had `automountServiceAccountToken: false` (a symptom of the
  collision above) — recreate the pod after fixing.
- Envoy-style 15s default route timeouts apply here too: A2A/MCP routes carry
  `timeouts: 900s`.

## Verifying

```sh
make smoke                                   # agent + MCP tool + LLM-via-gateway
curl http://10.20.0.101/a2a/kagent/mvp-agent/.well-known/agent-card.json
kubectl -n agentgateway-system logs deploy/platform-gw | grep gen_ai   # token accounting
# federated endpoint: register servers via the portal/API, then
# POST /v1/mcp-servers/validate {"url": "http://10.20.0.101/mcp"}
```

Agents created before Phase 3 get their gateway exposure on their next edit
(create/update both call `ensure_agent_exposure`).
