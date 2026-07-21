"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  AgentIn,
  AgentOut,
  createAgent,
  listMcpServers,
  listModelConfigs,
  updateAgent,
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

export function AgentForm({ mode, namespace, initial }: AgentFormProps) {
  const router = useRouter();
  const { showError } = useToast();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const tools = (mcpServers ?? [])
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
        .filter((t): t is NonNullable<typeof t> => t !== null);

      const input: AgentIn = {
        name,
        description: description || undefined,
        system_message: systemMessage,
        model_config: modelConfig || undefined,
        tags,
        tools,
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
        <label className="field-label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          required
          disabled={mode === "edit"}
          value={name}
          onChange={(e) => setName(e.target.value)}
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

      <div>
        <label className="field-label">Tags</label>
        <TagsInput value={tags} onChange={setTags} />
      </div>

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

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : mode === "new" ? "Create agent" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
