"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  AgentIn,
  AgentOut,
  AgentType,
  McpServerOut,
  SkillRef,
  ToolRef,
  createAgent,
  listMcpServers,
  listModelConfigs,
  listSkills,
  updateAgent,
  slugifyName,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEnvironment } from "@/lib/environment";
import { useToast } from "@/components/Toast";
import { TagsInput } from "@/components/TagsInput";
import { ErrorBanner } from "@/components/ErrorBanner";

interface AgentFormProps {
  mode: "new" | "edit";
  namespace?: string;
  initial?: AgentOut;
}

// Key skills by image (uploaded) or url+path (git) so a selected catalog
// skill matches the refs already stored on an agent.
const skillKey = (s: { url?: string | null; image?: string | null; path?: string | null }) =>
  s.image ? `img::${s.image}` : `${s.url ?? ""}::${s.path ?? ""}`;

// Per-tool permission scope: deny (not attached), allow (attached, no
// approval needed), ask (attached, requires human approval before running).
type ToolScope = "allow" | "ask" | "deny";

const ALL_TOOLS_SENTINEL = "__all__";

// server name -> tool name -> scope, seeded from the agent's existing
// tool_names/require_approval. A server with no tools at any non-deny scope
// is simply omitted from the submitted `tools` array.
function initToolScopes(tools: ToolRef[]): Record<string, Record<string, ToolScope>> {
  const seed: Record<string, Record<string, ToolScope>> = {};
  for (const tool of tools) {
    const scopes: Record<string, ToolScope> = {};
    if (tool.tool_names) {
      for (const name of tool.tool_names) {
        scopes[name] = tool.require_approval?.includes(name) ? "ask" : "allow";
      }
    } else {
      // omitted tool_names = every discovered tool allowed; resolved once
      // the server's discovered_tools are known (see resolvedToolScopes).
      scopes[ALL_TOOLS_SENTINEL] = "allow";
      for (const name of tool.require_approval ?? []) {
        scopes[name] = "ask";
      }
    }
    seed[tool.mcp_server] = scopes;
  }
  return seed;
}

export function AgentForm({ mode, namespace, initial }: AgentFormProps) {
  const router = useRouter();
  const { showError } = useToast();
  const { namespace: envNamespace } = useEnvironment();

  const [type, setType] = useState<AgentType>(initial?.type ?? "Declarative");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [systemMessage, setSystemMessage] = useState(initial?.system_message ?? "");
  const [modelConfig, setModelConfig] = useState(initial?.model_config ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);

  const { data: mcpServers, loading: mcpLoading, error: mcpError } = useApi(
    () => listMcpServers(envNamespace),
    [envNamespace],
  );
  const { data: modelConfigs, loading: mcLoading, error: mcError } = useApi(
    () => listModelConfigs(envNamespace),
    [envNamespace],
  );
  const { data: skills, loading: skillsLoading, error: skillsError } = useApi(
    () => listSkills(envNamespace),
    [envNamespace],
  );

  const [toolScopes, setToolScopes] = useState<Record<string, Record<string, ToolScope>>>(() =>
    initToolScopes(initial?.tools ?? []),
  );

  // Resolve the "all tools" sentinel once discovered tools are known.
  const resolvedToolScopes = useMemo(() => {
    if (!mcpServers) return toolScopes;
    const resolved: Record<string, Record<string, ToolScope>> = {};
    for (const [server, scopes] of Object.entries(toolScopes)) {
      if (ALL_TOOLS_SENTINEL in scopes) {
        const found = mcpServers.find((s) => s.name === server);
        const expanded: Record<string, ToolScope> = {};
        for (const t of found?.discovered_tools ?? []) {
          expanded[t.name] = scopes[t.name] === "ask" ? "ask" : "allow";
        }
        resolved[server] = expanded;
      } else {
        resolved[server] = scopes;
      }
    }
    return resolved;
  }, [toolScopes, mcpServers]);

  const getScope = (server: string, tool: string): ToolScope =>
    resolvedToolScopes[server]?.[tool] ?? "deny";

  const setScope = (server: string, tool: string, scope: ToolScope) => {
    setToolScopes((prev) => {
      const current = { ...(resolvedToolScopes[server] ?? prev[server] ?? {}) };
      current[tool] = scope;
      return { ...prev, [server]: current };
    });
  };

  // Deny -> not in tool_names. Allow -> in tool_names. Ask -> in tool_names
  // and require_approval. All-allow -> tool_names omitted entirely.
  const encodeToolRef = (server: McpServerOut): ToolRef | null => {
    const scopes = resolvedToolScopes[server.name] ?? {};
    const allNames = server.discovered_tools.map((t) => t.name);
    const included = allNames.filter((n) => (scopes[n] ?? "deny") !== "deny");
    if (included.length === 0) return null;
    const askFor = included.filter((n) => scopes[n] === "ask");
    const allAllowed = included.length === allNames.length && askFor.length === 0;
    return {
      mcp_server: server.name,
      tool_names: allAllowed ? undefined : included,
      require_approval: askFor.length > 0 ? askFor : undefined,
    };
  };

  // Catalog skills the agent is already attached to, keyed by url+path.
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    for (const s of initial?.skills ?? []) {
      seed.add(skillKey(s));
    }
    return seed;
  });

  const toggleSkill = (skill: { url?: string | null; image?: string | null; path?: string | null }) => {
    const key = skillKey(skill);
    setSelectedSkillKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Existing skill refs on the agent that don't match anything in the
  // catalog (deleted skill, or one this portal doesn't know about) — keep
  // them as-is rather than silently dropping them on save.
  const unmatchedSkills: SkillRef[] = useMemo(() => {
    const existing = initial?.skills ?? [];
    if (!skills) return existing;
    return existing.filter(
      (s) => !skills.some((cs) => skillKey(cs) === skillKey(s)),
    );
  }, [skills, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tools =
        type === "Declarative"
          ? (mcpServers ?? [])
              .map((server) => encodeToolRef(server))
              .filter((t): t is ToolRef => t !== null)
          : [];

      const matchedSkills: SkillRef[] = (skills ?? [])
        .filter((s) => selectedSkillKeys.has(skillKey(s)))
        .map((s) =>
          s.image
            ? { image: s.image, name: s.name }
            : {
                url: s.url,
                name: s.name,
                path: s.path || undefined,
                ref: s.ref || undefined,
              },
        );

      const input: AgentIn = {
        name,
        description: description || undefined,
        type,
        tags,
        tools,
        skills: [...matchedSkills, ...unmatchedSkills],
        ...(mode === "new" ? { namespace: envNamespace } : {}),
        ...(type === "BYO"
          ? { image: image || undefined }
          : { system_message: systemMessage, model_config: modelConfig || undefined }),
      };

      const result =
        mode === "new"
          ? await createAgent(input)
          : await updateAgent(namespace!, initial!.name, input);

      router.push(`/agents/${result.namespace ?? namespace ?? "kagent"}/${result.name}`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to save agent");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-5">
      <div className="panel flex flex-col gap-4">
        <span className="mono-caption">Identity</span>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="type">
              Type
            </label>
            <select
              id="type"
              value={type}
              disabled={mode === "edit"}
              onChange={(e) => setType(e.target.value as AgentType)}
              className="field-input disabled:opacity-60"
            >
              <option value="Declarative">Declarative</option>
              <option value="BYO">BYO (bring your own image)</option>
            </select>
            {mode === "edit" && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>
                Type cannot be changed after creation.
              </p>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              required
              disabled={mode === "edit"}
              value={name}
              onChange={(e) => setName(slugifyName(e.target.value))}
              className="field-input font-mono disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field-input"
          />
        </div>
      </div>

      {type === "BYO" ? (
        <div className="panel flex flex-col gap-2">
          <span className="mono-caption">Image</span>
          <input
            id="image"
            required
            placeholder="10.20.0.1:5050/my-agent:dev"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="field-input font-mono"
          />
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Container must serve the A2A protocol on port 8080.
          </p>
        </div>
      ) : (
        <>
          <div className="panel flex flex-col gap-2">
            <span className="mono-caption">Model</span>
            {mcError && <ErrorBanner message={mcError} />}
            <select
              id="model_config"
              value={modelConfig}
              onChange={(e) => setModelConfig(e.target.value)}
              className="field-input"
              disabled={mcLoading}
            >
              <option value="">— none —</option>
              {modelConfigs?.map((mc) => (
                <option key={mc.name} value={mc.name}>
                  {mc.name} ({mc.provider}/{mc.model})
                </option>
              ))}
            </select>
          </div>

          <div className="panel flex flex-col gap-2">
            <label className="mono-caption" htmlFor="system_message">
              Instructions
            </label>
            <textarea
              id="system_message"
              required
              rows={8}
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              className="code-block"
              placeholder="# role&#10;You are …"
            />
          </div>
        </>
      )}

      {type === "Declarative" && (
        <div className="panel flex flex-col gap-3">
          <span className="mono-caption">Tools</span>
          {mcpError && <ErrorBanner message={mcpError} />}
          {mcpLoading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading MCP servers…</p>}
          {mcpServers?.length === 0 && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              No MCP servers registered yet.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {mcpServers?.map((server) => (
              <div key={server.name} className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--color-border)" }}>
                <p className="mb-2" style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12.5px" }}>
                  {server.name}
                </p>
                {server.discovered_tools.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    No discovered tools.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {server.discovered_tools.map((tool) => {
                      const scope = getScope(server.name, tool.name);
                      return (
                        <div key={tool.name} className="flex items-center justify-between gap-3">
                          <span className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                            {tool.name}
                          </span>
                          <div className="scope-toggle">
                            {(["allow", "ask", "deny"] as ToolScope[]).map((option) => (
                              <button
                                key={option}
                                type="button"
                                className={`scope-btn ${
                                  scope === option ? `scope-btn-${option}-active` : ""
                                }`}
                                onClick={() => setScope(server.name, tool.name, option)}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel flex flex-col gap-3">
        <span className="mono-caption">Skills</span>
        {skillsError && <ErrorBanner message={skillsError} />}
        {skillsLoading && <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading skills…</p>}
        {skills?.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No skills registered yet.
          </p>
        )}
        {skills && skills.length > 0 && (
          <div className="flex flex-col gap-2">
            {skills.map((skill) => (
              <label key={`${skill.namespace}/${skill.name}`} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSkillKeys.has(skillKey(skill))}
                  onChange={() => toggleSkill(skill)}
                />
                <span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{skill.name}</span>
                  {skill.description && (
                    <span style={{ color: "var(--color-muted)" }}> — {skill.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        {unmatchedSkills.length > 0 && (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Also attached ({unmatchedSkills.length} not in the skills catalog, kept as-is):{" "}
            {unmatchedSkills.map((s) => s.name || s.url || s.image).join(", ")}
          </p>
        )}
      </div>

      <div className="panel flex flex-col gap-2">
        <span className="mono-caption">Tags</span>
        <TagsInput value={tags} onChange={setTags} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : mode === "new" ? "Create agent" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
