# Phase 0 — Foundation runbook

GitOps foundation: ArgoCD app-of-apps installs kagent, agentgateway, and kmcp,
then a smoke-test agent + MCP server prove the stack end to end. See
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) for the full phased plan.

## Prerequisites

- Talos homelab reachable, `kubectl config get-contexts` shows `admin@homelab`.
- ArgoCD already installed in the `argocd` namespace (verified, zero
  Applications before this).
- llama-swap reachable in-cluster at `http://10.20.0.1:9292/v1` (verified).
- This repo pushed to `https://github.com/nekrerzy/kagent-test.git`, branch
  `main` — ArgoCD pulls from there, not from your local checkout.

## Bootstrap

The **only** manual `kubectl apply` in this whole setup:

```sh
make argocd-bootstrap
```

This applies `infra/argocd/root-app.yaml` (the `platform-root` Application),
which points ArgoCD at `infra/argocd/apps/` and syncs everything below with
`prune: true, selfHeal: true`. From here on, changes ship by editing files in
this repo and pushing to `main` — no more manual `kubectl apply`.

## What gets created, in order (ArgoCD sync-waves)

| Wave | Application | Installs |
|---|---|---|
| 0 | `kagent-crds` | kagent + kmcp CRDs (`kagent.dev/v1alpha1`, `v1alpha2`) in namespace `kagent` |
| 0 | `agentgateway-crds` | agentgateway CRDs in `agentgateway-system` |
| 1 | `kagent` | kagent controller + UI + bundled Postgres (pgvector), namespace `kagent` |
| 1 | `agentgateway` | agentgateway controller + `agentgateway` GatewayClass, namespace `agentgateway-system` |
| 1 | `kmcp` | kmcp controller, namespace `kmcp-system` |
| 2 | `platform-examples` | `hello-mcp-server` (MCPServer), `hello-agent` (Agent) + its RemoteMCPServer, and the `agentgateway` Gateway |

Sync-waves only order *within* one ArgoCD sync operation; ArgoCD's own
auto-sync polling (default every few minutes, or on webhook) is what actually
triggers each wave once the prior one is `Synced`/`Healthy`.

## Verification

1. **ArgoCD state** — every Application should reach `Synced` + `Healthy`:
   ```sh
   kubectl --context admin@homelab -n argocd get applications
   ```

2. **Controllers up**:
   ```sh
   kubectl --context admin@homelab -n kagent get pods
   kubectl --context admin@homelab -n agentgateway-system get pods
   kubectl --context admin@homelab -n kmcp-system get pods
   ```

3. **MetalLB assigned the agentgateway IP** — the agentgateway controller
   provisions a `LoadBalancer` Service for the `Gateway/agentgateway` object;
   confirm it got an address from the `10.20.0.100-200` pool (should differ
   from `10.20.0.100`, which is `homelab-gateway`/Envoy):
   ```sh
   kubectl --context admin@homelab -n agentgateway-system get svc -o wide
   kubectl --context admin@homelab -n agentgateway-system get gateway agentgateway
   ```
   The Gateway's `status.addresses` should match the Service's external IP,
   and its `Accepted`/`Programmed` conditions should be `True`.

4. **Smoke path** — see [examples/README.md](../examples/README.md) for the
   full agent + MCP tool chat walkthrough via the kagent UI.

## Troubleshooting

- **kmcp `MCPServer` pod stuck `Pending`/`CrashLoopBackOff` at first sync**:
  the `npx` package fetch on cold start can take a while; give it a couple of
  minutes before assuming failure.
- **A pod is rejected at admission (`violates PodSecurity "restricted"`)**:
  this cluster enforces `restricted` Pod Security Admission by default on new
  namespaces (verified: the `default` namespace has no PSA labels yet is
  restricted-enforced, so it's a cluster-wide default, not per-namespace
  opt-in — `metallb-system` is the one explicit exception, labeled
  `privileged`). Every chart/manifest in this repo was checked against that
  baseline (see `infra/agentgateway/values.yaml` and
  `examples/mcp-server/mcpserver.yaml` for the two places upstream defaults
  needed an explicit `securityContext`/`podSecurityContext` override). If a
  future chart bump reintroduces this, either fix the values override or, as
  a last resort, label that one namespace
  `pod-security.kubernetes.io/enforce=baseline` and note why.
