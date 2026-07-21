"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  AgentIn,
  AgentOut,
  AgentType,
  SkillRef,
  createAgent,
  listMcpServers,
  listModelConfigs,
  listSkills,
  updateAgent,
  slugifyName,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { TagsInput } from "@/components/TagsInput";
import { ErrorBanner } from "@/components/ErrorBanner";

interface AgentFormProps {
  mode: "new" | "edit";
  namespace?: string;
  initial?: AgentOut;
}

// Key skills by url+path so we can match a selected catalog skill against
// the skill refs already stored on an agent (name/ref may differ or be unset).
const skillKey = (url: string, path?: string | null) => `${url}::${path ?? ""}`;

export function AgentForm({ mode, namespace, initial }: AgentFormProps) {
  const router = useRouter();
  const { showError } = useToast();

  const [type, setType] = useState<AgentType>(initial?.type ?? "Declarative");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [systemMessage, setSystemMessage] = useState(initial?.system_message ?? "");
  const [modelConfig, setModelConfig] = useState(initial?.model_config ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);

  const { data: mcpServers, loading: mcpLoading, error: mcpError } = useApi(
    listMcpServers,
    [],
  );
  const { data: modelConfigs, loading: mcLoading, error: mcError } = useApi(
    listModelConfigs,
    [],
  );
  const { data: skills, loading: skillsLoading, error: skillsError } = useApi(
    listSkills,
    [],
  );

  // server name -> set of selected tool names. A server only appears in the
  // submitted `tools` array if its set is non-empty.
  const [selection, setSelection] = useState<Record<string, Set<string>>>(() => {
    const seed: Record<string, Set<string>> = {};
    for (const tool of initial?.tools ?? []) {
      seed[tool.mcp_server] = new Set(tool.tool_names ?? ["__all__"]);
    }
    return seed;
  });

  // Resolve the "__all__" seed placeholder once discovered tools are known.
  const resolvedSelection = useMemo(() => {
    if (!mcpServers) return selection;
    const resolved: Record<string, Set<string>> = {};
    for (const [server, set] of Object.entries(selection)) {
      if (set.has("__all__")) {
        const found = mcpServers.find((s) => s.name === server);
        resolved[server] = new Set(found?.discovered_tools.map((t) => t.name) ?? []);
      } else {
        resolved[server] = set;
      }
    }
    return resolved;
  }, [selection, mcpServers]);

  const toggleTool = (server: string, tool: string) => {
    setSelection((prev) => {
      const current = new Set(resolvedSelection[server] ?? prev[server] ?? []);
      if (current.has(tool)) current.delete(tool);
      else current.add(tool);
      return { ...prev, [server]: current };
    });
  };

  // Catalog skills the agent is already attached to, keyed by url+path.
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    for (const s of initial?.skills ?? []) {
      seed.add(skillKey(s.url, s.path));
    }
    return seed;
  });

  const toggleSkill = (url: string, path?: string | null) => {
    const key = skillKey(url, path);
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
      (s) => !skills.some((cs) => skillKey(cs.url, cs.path) === skillKey(s.url, s.path)),
    );
  }, [skills, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tools =
        type === "Declarative"
          ? (mcpServers ?? [])
              .map((server) => {
                const set = resolvedSelection[server.name];
                if (!set || set.size === 0) return null;
                const allNames = server.discovered_tools.map((t) => t.name);
                const allChecked = allNames.length > 0 && allNames.every((n) => set.has(n));
                return {
                  mcp_server: server.name,
                  tool_names: allChecked ? null : Array.from(set),
                };
              })
              .filter((t): t is NonNullable<typeof t> => t !== null)
          : [];

      const matchedSkills: SkillRef[] = (skills ?? [])
        .filter((s) => selectedSkillKeys.has(skillKey(s.url, s.path)))
        .map((s) => ({
          url: s.url,
          name: s.name,
          path: s.path || undefined,
          ref: s.ref || undefined,
        }));

      const input: AgentIn = {
        name,
        description: description || undefined,
        type,
        tags,
        tools,
        skills: [...matchedSkills, ...unmatchedSkills],
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
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
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
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
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
          className="field-input disabled:opacity-60"
        />
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

      {type === "BYO" ? (
        <div>
          <label className="field-label" htmlFor="image">
            Image
          </label>
          <input
            id="image"
            required
            placeholder="10.20.0.1:5050/my-agent:dev"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="field-input font-mono"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Container must serve the A2A protocol on port 8080.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="field-label" htmlFor="system_message">
              System message
            </label>
            <textarea
              id="system_message"
              required
              rows={6}
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              className="field-input font-mono"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="model_config">
              Model config
            </label>
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
        </>
      )}

      <div>
        <label className="field-label">Tags</label>
        <TagsInput value={tags} onChange={setTags} />
      </div>

      {type === "Declarative" && (
        <div>
          <label className="field-label">Tools</label>
          {mcpError && <ErrorBanner message={mcpError} />}
          {mcpLoading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading MCP servers…</p>}
          {mcpServers?.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No MCP servers registered yet.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {mcpServers?.map((server) => (
              <div key={server.name} className="surface rounded-md p-3">
                <p className="mb-2 text-sm font-medium">{server.name}</p>
                {server.discovered_tools.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    No discovered tools.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {server.discovered_tools.map((tool) => (
                      <label key={tool.name} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={resolvedSelection[server.name]?.has(tool.name) ?? false}
                          onChange={() => toggleTool(server.name, tool.name)}
                        />
                        {tool.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="field-label">Skills</label>
        {skillsError && <ErrorBanner message={skillsError} />}
        {skillsLoading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading skills…</p>}
        {skills?.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No skills registered yet.
          </p>
        )}
        {skills && skills.length > 0 && (
          <div className="surface flex flex-col gap-2 rounded-md p-3">
            {skills.map((skill) => (
              <label key={`${skill.namespace}/${skill.name}`} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSkillKeys.has(skillKey(skill.url, skill.path))}
                  onChange={() => toggleSkill(skill.url, skill.path)}
                />
                <span>
                  <span className="font-medium">{skill.name}</span>
                  {skill.description && (
                    <span style={{ color: "var(--muted)" }}> — {skill.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        {unmatchedSkills.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Also attached ({unmatchedSkills.length} not in the skills catalog, kept as-is):{" "}
            {unmatchedSkills.map((s) => s.name || s.url).join(", ")}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : mode === "new" ? "Create agent" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
