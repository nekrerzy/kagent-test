// Single typed client for the platform REST API.
// Every component that needs data goes through the functions exported here —
// nothing else in the app calls `fetch` directly.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://api.10.20.0.100.sslip.io";

export const DEFAULT_NAMESPACE = "kagent";

// Kubernetes resource names must be lowercase RFC 1123; applied live in the
// name inputs so users can type "Microsoft MCP" and get "microsoft-mcp".
export function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[-.]+/, "")
    .slice(0, 63);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---- wire types (mirrors apps/api schemas.py) --------------------------

export type Protocol = "SSE" | "STREAMABLE_HTTP";

export type ModelProvider =
  | "OpenAI"
  | "Anthropic"
  | "AzureOpenAI"
  | "Ollama"
  | "Gemini"
  | "GeminiVertexAI"
  | "AnthropicVertexAI";

export interface ToolRef {
  mcp_server: string;
  tool_names?: string[] | null;
}

export interface AgentIn {
  name: string;
  namespace?: string | null;
  description?: string | null;
  system_message: string;
  model_config?: string | null;
  tools: ToolRef[];
  tags: string[];
}

export interface AgentOut extends AgentIn {
  ready: boolean | null;
  a2a_url: string | null;
}

export interface McpServerIn {
  name: string;
  namespace?: string | null;
  description?: string | null;
  url: string;
  protocol: Protocol;
  tags: string[];
}

export interface DiscoveredTool {
  name: string;
  description?: string;
}

export interface McpServerOut extends McpServerIn {
  ready: boolean | null;
  discovered_tools: DiscoveredTool[];
}

export interface ModelConfigIn {
  name: string;
  namespace?: string | null;
  provider: ModelProvider;
  model: string;
  base_url?: string | null;
  api_key?: string | null;
}

export interface ModelConfigOut {
  name: string;
  namespace: string;
  provider: ModelProvider;
  model: string;
  base_url?: string | null;
  ready: boolean | null;
}

export interface CatalogOut {
  agents: AgentOut[];
  mcp_servers: McpServerOut[];
  model_configs: ModelConfigOut[];
}

export interface InvokeIn {
  text: string;
  session_id?: string | null;
}

export interface InvokeOut {
  text: string;
  task_id?: string | null;
  context_id?: string | null;
}

// AgentCard is A2A's own JSON shape — we just render it, so keep it loose.
export type AgentCard = Record<string, unknown>;

// ---- fetch wrapper -------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      `Could not reach the platform API at ${API_BASE}. Is it running?`,
      0,
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
      // FastAPI validation errors: detail is a list of {loc, msg, ...}
      else if (body && Array.isArray(body.detail))
        detail = body.detail
          .map((d: { loc?: (string | number)[]; msg?: string }) =>
            [d.loc?.slice(1).join("."), d.msg].filter(Boolean).join(": "),
          )
          .join("; ");
    } catch {
      // response wasn't JSON, fall back to statusText
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

// ---- catalog --------------------------------------------------------------

export function getCatalog(q?: string): Promise<CatalogOut> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return request<CatalogOut>(`/v1/catalog${qs}`);
}

// ---- agents -----------------------------------------------------------

export function listAgents(): Promise<AgentOut[]> {
  return request<AgentOut[]>("/v1/agents");
}

export function getAgent(ns: string, name: string): Promise<AgentOut> {
  return request<AgentOut>(`/v1/agents/${ns}/${name}`);
}

export function createAgent(input: AgentIn): Promise<AgentOut> {
  return request<AgentOut>("/v1/agents", { method: "POST", body: json(input) });
}

export function updateAgent(
  ns: string,
  name: string,
  input: AgentIn,
): Promise<AgentOut> {
  return request<AgentOut>(`/v1/agents/${ns}/${name}`, {
    method: "PUT",
    body: json(input),
  });
}

export function deleteAgent(ns: string, name: string): Promise<void> {
  return request<void>(`/v1/agents/${ns}/${name}`, { method: "DELETE" });
}

export function getAgentCard(ns: string, name: string): Promise<AgentCard> {
  return request<AgentCard>(`/v1/agents/${ns}/${name}/card`);
}

export function invokeAgent(
  ns: string,
  name: string,
  input: InvokeIn,
): Promise<InvokeOut> {
  return request<InvokeOut>(`/v1/agents/${ns}/${name}/invoke`, {
    method: "POST",
    body: json(input),
  });
}

export interface StreamEvent {
  // `text` is a full snapshot of the answer so far (not a delta) — replace, don't append.
  text?: string;
  tool?: string;
  error?: string;
  context_id?: string | null;
  done: boolean;
}

export async function streamAgent(
  ns: string,
  name: string,
  input: InvokeIn,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/agents/${ns}/${name}/invoke/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json(input),
    });
  } catch {
    throw new ApiError(
      `Could not reach the platform API at ${API_BASE}. Is it running?`,
      0,
    );
  }
  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
      // FastAPI validation errors: detail is a list of {loc, msg, ...}
      else if (body && Array.isArray(body.detail))
        detail = body.detail
          .map((d: { loc?: (string | number)[]; msg?: string }) =>
            [d.loc?.slice(1).join("."), d.msg].filter(Boolean).join(": "),
          )
          .join("; ");
    } catch {
      // response wasn't JSON, fall back to statusText
    }
    throw new ApiError(detail, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(5)));
      } catch {
        // skip malformed frame
      }
    }
  }
}

// ---- mcp servers --------------------------------------------------------

export function listMcpServers(): Promise<McpServerOut[]> {
  return request<McpServerOut[]>("/v1/mcp-servers");
}

export function getMcpServer(ns: string, name: string): Promise<McpServerOut> {
  return request<McpServerOut>(`/v1/mcp-servers/${ns}/${name}`);
}

export interface McpProbeOut {
  reachable: boolean;
  tools: DiscoveredTool[];
  error?: string | null;
}

export function validateMcpServer(input: {
  url: string;
  protocol: Protocol;
}): Promise<McpProbeOut> {
  return request<McpProbeOut>("/v1/mcp-servers/validate", {
    method: "POST",
    body: json(input),
  });
}

export function createMcpServer(input: McpServerIn): Promise<McpServerOut> {
  return request<McpServerOut>("/v1/mcp-servers", {
    method: "POST",
    body: json(input),
  });
}

export function updateMcpServer(
  ns: string,
  name: string,
  input: McpServerIn,
): Promise<McpServerOut> {
  return request<McpServerOut>(`/v1/mcp-servers/${ns}/${name}`, {
    method: "PUT",
    body: json(input),
  });
}

export function deleteMcpServer(ns: string, name: string): Promise<void> {
  return request<void>(`/v1/mcp-servers/${ns}/${name}`, { method: "DELETE" });
}

// ---- model configs ------------------------------------------------------

export function listModelConfigs(): Promise<ModelConfigOut[]> {
  return request<ModelConfigOut[]>("/v1/model-configs");
}

export function getModelConfig(
  ns: string,
  name: string,
): Promise<ModelConfigOut> {
  return request<ModelConfigOut>(`/v1/model-configs/${ns}/${name}`);
}

export function createModelConfig(
  input: ModelConfigIn,
): Promise<ModelConfigOut> {
  return request<ModelConfigOut>("/v1/model-configs", {
    method: "POST",
    body: json(input),
  });
}

export function deleteModelConfig(ns: string, name: string): Promise<void> {
  return request<void>(`/v1/model-configs/${ns}/${name}`, {
    method: "DELETE",
  });
}
