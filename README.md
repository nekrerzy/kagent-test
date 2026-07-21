# Agents Platform

A portal + REST API to create, manage, and discover **Agents**, **MCP servers**, and **Skills**
for agentic workflows — built on [kagent](https://kagent.dev) and
[agentgateway](https://agentgateway.dev), running on a local Talos Kubernetes cluster.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full phased plan and
due-diligence notes.

## Layout

| Path | Purpose |
|---|---|
| `apps/api` | Platform REST API (FastAPI) — Phase 1 |
| `apps/portal` | Portal frontend (Next.js) — Phase 2 |
| `infra/argocd` | ArgoCD app-of-apps + Application manifests |
| `infra/kagent` | kagent Helm values (pinned) |
| `infra/agentgateway` | agentgateway Helm values (pinned) |
| `infra/kmcp` | kmcp Helm values (pinned) |
| `infra/platform` | Helm chart for the platform API + portal |
| `examples/` | Sample agent, MCP server, and skill used by the smoke test |

## Cluster

Talos homelab, kubectl context `admin@homelab`. Local LLM inference (llama-swap,
OpenAI-compatible) at `http://10.20.0.1:9292/v1` — models `gemma`, `gpt-oss`, `qwen`.

## Access (LAN)

| What | URL |
|---|---|
| Portal | http://portal.10.20.0.100.sslip.io |
| Platform API (OpenAPI at `/docs`) | http://api.10.20.0.100.sslip.io |
| agentgateway data plane | http://10.20.0.101 |

Images are served from a local registry at `10.20.0.1:5050` — see
[docs/local-registry.md](docs/local-registry.md) for the one-time Talos
node configuration.

## Tasks

```sh
make help
```
