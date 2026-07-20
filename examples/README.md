# Phase 0 smoke-test resources

Applied by the `platform-examples` ArgoCD Application (sync-wave 2, after every
controller in `infra/` is up). See [docs/phase-0.md](../docs/phase-0.md) for the
full bootstrap runbook.

| File | Creates |
|---|---|
| `mcp-server/mcpserver.yaml` | `MCPServer/hello-mcp-server` (kmcp) — runs `npx @modelcontextprotocol/server-everything` |
| `agents/hello-agent.yaml` | `RemoteMCPServer/hello-mcp-server` + `Agent/hello-agent` (kagent) |
| `gateway/agentgateway-gateway.yaml` | `Gateway/agentgateway` (class `agentgateway`, in `agentgateway-system`) |

All kagent/kmcp resources live in the `kagent` namespace (kept simple for
Phase 0 — no dedicated examples namespace).

## Verify

1. Everything synced:
   ```sh
   kubectl --context admin@homelab -n kagent get mcpserver hello-mcp-server
   kubectl --context admin@homelab -n kagent get remotemcpserver hello-mcp-server
   kubectl --context admin@homelab -n kagent get agent hello-agent
   ```
   All three should show a `True`/`Ready` condition within a couple of minutes
   (the `npx` package fetch on first start can take a bit).

2. Port-forward the kagent UI:
   ```sh
   kubectl --context admin@homelab -n kagent port-forward svc/kagent-ui 8080:8080
   ```
   Open <http://localhost:8080>, find **hello-agent**, and start a chat.

3. Ask it to use a tool, e.g.:
   > "Use one of your tools to echo back the text 'agents platform phase 0'."

   Expect the agent to call an MCP tool from `hello-mcp-server` (visible in the
   UI's tool-call trace) and return a result — this is the end-to-end proof
   that kagent → RemoteMCPServer → kmcp-managed MCP server → local LLM
   (llama-swap) all work together.
