# Portal (Next.js)

Phase 2 — see [../../IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) §5.

A developer/non-developer portal to create, manage, discover, and test Agents, MCP
servers, and model configs. Consumes **only** the platform REST API (`apps/api`) —
it never talks to Kubernetes or kagent directly.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4.
- All data fetching goes through the single typed client in `lib/api.ts`. No other
  module calls `fetch` directly.
- Client-side rendering + a small hand-rolled SWR-style hook (`lib/useApi.ts`) —
  no react-query, no component library.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `http://api.10.20.0.100.sslip.io` | Base URL of the platform REST API. Baked in at build time (it's a `NEXT_PUBLIC_*` var); override via the Docker build ARG of the same name for a different environment. |

## Develop

```sh
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build && npm run start
```

The portal renders gracefully (empty/error states, never a crash) if the API is
unreachable — handy for developing the UI before the API is deployed.

## Pages

| Route | Purpose |
|---|---|
| `/` | Catalog/discover — search + grids of Agents, MCP Servers, Model Configs |
| `/agents/new`, `/agents/[ns]/[name]/edit` | Agent builder |
| `/agents/[ns]/[name]` | Agent detail + AgentCard viewer + chat playground |
| `/mcp-servers/new`, `/mcp-servers/[ns]/[name]` | MCP server registration + detail |
| `/model-configs` | Model config list + create |

## Docker

```sh
docker build --build-arg NEXT_PUBLIC_API_BASE=http://api.10.20.0.100.sslip.io -t portal apps/portal
```

Multi-stage build, final image is `node:24-alpine` running the Next.js standalone
server as non-root UID `10001` on port `3000` — compatible with Kubernetes
`restricted` Pod Security Admission (no root, no privilege escalation).
