# Agents Platform — Implementation Plan

**Status:** Draft for review · **Date:** 2026-07-20

## 1. Context

Build an **Agents Platform**: a portal + REST API where developers and regular users can create, update, delete, and **discover** Agents, MCP servers, and Skills for agentic workflows either declaratively or by bringing agents already built with other frameworks (LangGraph, CrewAI, Google ADK, custom).

- **Runtime substrate:** local Talos Kubernetes homelab (already running).
- **Open-source foundation:** [kagent](https://kagent.dev) (CNCF Sandbox, agent runtime) + [agentgateway](https://agentgateway.dev) (AAIF/Linux Foundation, agentic data plane).
- **Our stack (decided):** Python/FastAPI REST API, Next.js portal, ArgoCD GitOps, auth deferred to a later phase (open MVP on LAN — deliberate).

## 2. Due-diligence summary (what shapes this plan)

### Cluster (verified live)
| Item | State |
|---|---|
| Nodes | 1 control plane + 3 workers, Talos v1.13.6, Kubernetes v1.36.2 |
| LB / ingress | MetalLB pool `10.20.0.100–200`; Envoy Gateway with Gateway `homelab-gateway` at `10.20.0.100` |
| GitOps | ArgoCD installed, **zero applications** — free to adopt as the deployment mechanism |
| Storage | `local-path` (default) — fine for homelab, no HA |
| kubectl context | `admin@homelab` (note: default context currently points at a stale GKE cluster) |
| Pod Security | cluster-wide PSA default: **enforce `baseline`**, warn/audit `restricted` (verified in apiserver admission config); we still author restricted-compliant manifests. `local-path-storage` ns needed an explicit `privileged` label so the provisioner's hostPath helper pods can run (applied 2026-07-21 — first PVC ever provisioned on this cluster) |
| Images | local registry `10.20.0.1:5050` (registry:3 on rootful docker, Talos bridge). Push via `crane push --insecure`; nodes need a one-time Talos machine-config registry-mirror patch |
| Local LLM | llama-swap on the host, reachable from pods at `http://10.20.0.1:9292/v1` (verified in-cluster); models `gemma-4-12b-it`, `gpt-oss-20b`, `qwen3.6-35b-a3b` (aliases: `gemma`, `gpt-oss`, `qwen`) |

### kagent (v0.9.12 stable, pre-1.0, releases every few days)
- **CRDs `kagent.dev/v1alpha2`**: `Agent` (type `Declarative` | `BYO`), `ModelConfig`, `ModelProviderConfig`, `RemoteMCPServer`. Old `ToolServer`/`Memory` CRDs are gone (v1alpha1→v1alpha2 was a breaking migration). Engine is now Google ADK (not AutoGen — ignore 2025 blog posts).
- Each Agent becomes its **own Deployment**, exposed via **A2A** at `/api/a2a/<ns>/<name>`.
- **BYO agents**: any container serving A2A on port 8080 with an AgentCard — documented for LangGraph, CrewAI, ADK. This is our "existing frameworks" story.
- **Skills**: first-class — `spec.skills` pulls OCI-image or git-based skill bundles (`SKILL.md` + resources) into the agent pod via init container. This is our Skills catalog integration point.
- **Controller REST API** (`/api/agents`, `/api/sessions`, `/api/tools`, …) is what kagent's own UI uses, but has **no OpenAPI spec and no stability contract**. → **Integrate against the CRD API for CRUD; use the REST API only for runtime concerns (sessions, invocations, tool discovery), pinned per kagent version.**
- **Auth is effectively absent in OSS**: `NoopAuthorizer` (every authenticated request can do everything), `unsecure` or `trusted-proxy` modes only. → Our platform API must be the trust boundary; never expose kagent's API/UI beyond the LAN.
- **PostgreSQL required** (pgx-only; pgvector for memory). Bundled Postgres is dev-only.
- **kmcp** (separate project, less active): CLI + `MCPServer` CRD to build/deploy MCP servers on-cluster; hand-off to kagent is `RemoteMCPServer` → kmcp Service URL (needs a validation spike).

### agentgateway (v1.3.1 stable; pin versions, expect churn)
- Rust data plane for MCP / A2A / LLM traffic. Tiny footprint (~30 MiB under load) — ideal for homelab.
- **Since v1.0 it is decoupled from kgateway**: own Helm charts (`agentgateway-crds` + `agentgateway` from `oci://cr.agentgateway.dev/charts/...`), own `agentgateway` GatewayClass. **We do not need kgateway at all.** Coexists with the existing Envoy Gateway class.
- **Dynamic config**: platform writes `AgentgatewayBackend` / `HTTPRoute` / `AgentgatewayPolicy` CRs → controller pushes delta xDS to proxies, **no restarts**. Exactly what API-driven registration needs.
- **MCP multiplexing**: many MCP servers federated behind one virtual MCP endpoint with namespaced tools — this powers "discover and consume the catalog through one URL".
- **Per-tool authorization**: CEL policies (`mcp.tool.name`, `mcp.tool.target`, JWT claims); unauthorized tools are hidden from `list_tools`, not just blocked.
- **LLM routing**: provider failover, weighted routing, cost/token attribution — route kagent's model egress through it.
- Admin UI is **read-only** in Kubernetes mode — all mutations via CRDs, which suits our "platform is the source of truth" model.

### Key risks to manage
1. **Pre-1.0 churn (kagent) / young project (agentgateway)** → pin exact chart+image versions in Git; upgrades are deliberate, tested events.
2. **kagent REST API has no contract** → isolate all calls to it behind one adapter module in our API; CRDs are the durable surface.
3. **No upstream authz** → platform API is the only user-facing entry point; kagent/agentgateway admin surfaces stay cluster-internal.
4. **kmcp ↔ kagent hand-off undocumented as one flow** → spike in Phase 3 before committing.
5. **Two gateway classes on one cluster** (Envoy for web, agentgateway for agentic traffic) → separate Gateways, separate MetalLB IPs; document clearly.

## 3. Target architecture

```
                        ┌────────────────────────── Talos cluster ──────────────────────────┐
 Browser ──► Envoy GW ──►  Portal (Next.js)                                                 │
 (10.20.0.100)          │      │                                                            │
 Devs/CI ──► Envoy GW ──►  Platform REST API (FastAPI)  ──► Kubernetes API (CRDs)           │
                        │      │        │                     ├─ kagent.dev/v1alpha2:       │
                        │      │        │                     │   Agent, ModelConfig,       │
                        │      │        │                     │   RemoteMCPServer           │
                        │      │        │                     ├─ kmcp: MCPServer            │
                        │      │        │                     └─ agentgateway.dev:          │
                        │      │        │                         Backend, Policy, Routes   │
                        │      │        └─► kagent controller REST (sessions/invoke only)   │
                        │      │                                                            │
 Agent/MCP ─► agentgateway GW (2nd MetalLB IP)                                              │
 clients        ├─ A2A routes ──► per-agent Deployments (kagent-managed)                    │
                ├─ virtual MCP (multiplex) ──► MCP server pods (kmcp) / remote MCP          │
                └─ LLM routes ──► local llama-swap (10.20.0.1:9292) [cloud providers later] │
                        └───────────────────────────────────────────────────────────────────┘
```

**Data model (platform):** the platform API keeps a small Postgres of its own for catalog metadata that CRDs can't hold (descriptions/tags for discovery, ownership, audit trail, soft-deletes), and treats the cluster CRDs as the runtime source of truth. A reconcile check flags drift.

## 4. Repository layout (monorepo)

```
kagent/                          # this repo
├── apps/
│   ├── api/                     # FastAPI platform API (uv, ruff, pytest, Pydantic)
│   └── portal/                  # Next.js portal
├── infra/
│   ├── argocd/                  # App-of-apps + Application manifests
│   ├── kagent/                  # Helm values (pinned versions)
│   ├── agentgateway/            # Helm values (pinned versions)
│   ├── kmcp/                    # Helm values
│   └── platform/                # Helm chart for api + portal + platform Postgres
├── examples/                    # sample declarative agent, BYO agent, MCP server, skill
├── docs/
├── Taskfile.yml (or Makefile)
└── IMPLEMENTATION_PLAN.md
```

## 5. Phases

### Phase 0 — Foundation: GitOps + core stack installed (~cluster work only, no app code)
1. Scaffold repo (layout above) + ArgoCD **app-of-apps** pointing at `infra/argocd/`. → verify: ArgoCD syncs an empty/apps shell.
2. Install **kagent** (`kagent-crds` + `kagent`, pinned v0.9.12; bundled Postgres acceptable for now, flagged for Phase 5 hardening). Default `ModelConfig`: provider `OpenAI` with `baseUrl: http://10.20.0.1:9292/v1` (local llama-swap; dummy API key). Prefer `qwen3.6-35b-a3b` or `gpt-oss-20b` as the default agent model — tool/function calling quality matters more than raw chat here; validate tool-calling against llama-swap as part of the smoke test (gemma is the fallback for plain chat). → verify: sample declarative agent answers via kagent UI (port-forward).
3. Install **agentgateway** (`agentgateway-crds` + `agentgateway`, pinned v1.3.1) + a Gateway of class `agentgateway` (gets second MetalLB IP). → verify: read-only admin UI shows the listener.
4. Install **kmcp** controller. → verify: sample `MCPServer` (e.g. a simple time/fetch server) reaches `Ready`.
5. Wire one end-to-end smoke path: `RemoteMCPServer` → kmcp server; agent uses its tool. → verify: agent invokes MCP tool successfully.

**Exit criteria:** everything Git-managed via ArgoCD; one agent + one MCP server working end-to-end; versions pinned.

### Phase 1 — Platform REST API (MVP CRUD + discovery)
FastAPI service in `apps/api`, deployed by ArgoCD, exposed through the **existing Envoy** `homelab-gateway` via HTTPRoute (`api.homelab.local`-style host). Unauthenticated by deliberate decision (LAN-only) until Phase 5.

Resources (all Pydantic-validated, OpenAPI auto-generated):
- `GET/POST/PUT/DELETE /v1/agents` — declarative agents → `Agent` CRDs (system prompt, model ref, tools, A2A skills metadata).
- `GET/POST/PUT/DELETE /v1/mcp-servers` — registrations → `RemoteMCPServer` CRDs; expose `status.discoveredTools` for discovery.
- `GET/POST/PUT/DELETE /v1/model-configs` — → `ModelConfig` CRDs (+ Secret handling for API keys; secrets never returned).
- `GET /v1/catalog/*` — discovery endpoints: searchable list of agents (with AgentCards), MCP servers (with tools), enriched with platform metadata (tags, owner, description) from platform Postgres.
- `POST /v1/agents/{ns}/{name}/invoke` + `GET /v1/agents/{ns}/{name}/card` — thin adapter over kagent A2A/sessions REST (isolated in one `kagent_client` module — the only place allowed to touch kagent's unstable REST API).

Engineering notes:
- Kubernetes access via official `kubernetes` Python client with a dedicated ServiceAccount, RBAC-scoped to exactly the CRD groups above.
- Platform Postgres (CloudNativePG or plain Deployment+PVC) for catalog metadata + audit log.
- Tests: pytest; CRD interactions tested against a mocked k8s API + one integration suite runnable against the live homelab (`task test:integration`).

**Exit criteria:** full agent + MCP server lifecycle possible with `curl` alone; OpenAPI docs at `/docs`.

### Phase 2 — Portal MVP (Next.js)
Consumes only the platform API. Pages:
- **Catalog/Discover**: browse/search agents, MCP servers (tools listed), model configs.
- **Agent builder**: form-driven declarative agent create/edit (prompt, model, tool picker from registered MCP servers, A2A skill metadata).
- **MCP server registration**: URL + transport + headers/TLS; show discovered tools and health.
- **Agent detail + playground**: AgentCard view, chat/test panel via the invoke endpoint.
- Deployed via ArgoCD, exposed on the Envoy `homelab-gateway` (`portal.homelab.local`).

**Exit criteria:** a non-developer can create an agent, attach tools, and chat with it entirely from the portal.

### Phase 3 — agentgateway integration (governed exposure + federation)
1. **LLM egress through the gateway**: point kagent `ModelConfig.baseUrl` at the agentgateway LLM route → cost/token attribution, failover, guardrails hooks.
2. **A2A exposure**: when an agent is created via the platform, the API also reconciles `AgentgatewayBackend` + `HTTPRoute` (agent Service marked `appProtocol: kgateway.dev/a2a`) so it's reachable at a stable external A2A URL. Deleting the agent garbage-collects the routes.
3. **Virtual MCP endpoint**: all registered MCP servers federated behind one multiplexed MCP URL (namespaced tools) — the platform's headline "one endpoint to consume the whole catalog" feature.
4. **Spike (timeboxed):** kmcp `MCPServer` → `RemoteMCPServer` → agentgateway backend hand-off, documented in `docs/`.
5. Observability: enable kagent + agentgateway OTel → Jaeger (or LGTM stack) via ArgoCD; surface trace links in the portal.

**Exit criteria:** external client can call any published agent (A2A) and the federated MCP endpoint through the agentgateway IP; portal shows per-agent cost/tokens (from gateway telemetry) or links to traces.

### Phase 4 — BYO agents + Skills catalog
1. **BYO agents**: platform API/portal accept `type: BYO` — container image + port → `Agent` CRD `byo.deployment.image`. Ship `examples/` for LangGraph and CrewAI (using kagent's checkpointer/memory endpoints). Contract validation: platform checks the AgentCard endpoint after deploy and surfaces status.
2. **Skills** (decided: **git-link**, no OCI registry needed): a skill is a folder (`SKILL.md` + scripts/resources) in a git repo; platform `skills` resource: `GET/POST/... /v1/skills` registers a git ref (repo URL + path + revision) with catalog metadata; portal Skills catalog; agent builder gains "attach skills" (→ `Agent.spec.skills.gitRefs`).
3. CLI-friendliness: document `curl`/`httpie` flows; optionally a tiny `platformctl` later — not in scope now.

**Exit criteria:** a LangGraph container from `examples/` runs as a platform agent; a skill authored in the portal repo is attached to an agent and demonstrably used.

### Phase 5 — AuthN/AuthZ, tenancy, hardening
1. **OIDC**: deploy Keycloak (or Dex) via ArgoCD; portal does OIDC login; API validates JWTs (FastAPI middleware). Roles: `admin`, `developer` (full CRUD), `user` (discover + invoke).
2. **Tenancy**: team → Kubernetes namespace mapping enforced **in the platform API** (kagent OSS will not do it — NoopAuthorizer); ownership recorded in platform DB; catalog visibility rules.
3. **Gateway policies**: `AgentgatewayPolicy` CEL rules keyed on JWT claims for per-tool access on the federated MCP endpoint.
4. **Hardening**: move kagent off bundled Postgres to CloudNativePG (with pgvector); NetworkPolicies so kagent controller/UI and agentgateway admin are unreachable except via the platform; TLS on both Gateways (cert-manager, local CA).

**Exit criteria:** two users with different roles see/do different things; kagent API unreachable directly from LAN; all data on managed Postgres.

## 6. Cross-cutting rules

- **Version pinning:** every chart/image version lives in Git (`infra/*/values.yaml`); Renovate-style bumps are PRs, upgraded one component at a time with the Phase 0 smoke test as the gate.
- **The platform API is the only writer** of kagent/agentgateway CRDs (besides GitOps for infra-level objects). No manual `kubectl apply` for catalog objects once Phase 1 lands.
- **Adapter isolation:** all kagent REST calls in one module with its own tests, so a kagent upgrade breakage is contained and detectable.
- **Secrets:** provider API keys only in Kubernetes Secrets (created via the API, never logged/returned); nothing in Git.

## 7. Verification strategy (per phase, repeatable)

- `task smoke` — end-to-end script: create MCP server → create agent with its tool → invoke → assert answer → delete both (runs against the live homelab; used as the upgrade gate).
- API: pytest unit + integration suites; portal: Playwright happy-path (create agent → chat).
- ArgoCD: all apps `Synced/Healthy` is the standing infra check.

## 8. Decisions log (was: open questions)

1. **LLM provider — DECIDED (2026-07-20):** local inference via llama-swap at `http://10.20.0.1:9292/v1` (OpenAI-compatible; models `gemma`, `gpt-oss`, `qwen`). Verified reachable from in-cluster pods. Cloud providers can be added later as extra ModelConfigs.
2. **kagent version — DECIDED (2026-07-20):** pin **v0.9.12**. v0.10 is still beta (`v0.10.0-beta8`) with churn concentrated in the new Sandbox/Substrate layer (off by default, needs an external sandbox system) — not stable enough even for dev, and it buys us nothing now since both lines share the `v1alpha2` CRDs our platform integrates against. Upgrade to v0.10.0 when it cuts stable: values bump + `task smoke` gate.
3. **Skills — DECIDED (2026-07-20):** git-link (`Agent.spec.skills.gitRefs`) — skills are multi-file folders, so git repos fit better than inline definitions; no in-cluster OCI registry required.
