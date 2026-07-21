"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  McpProbeOut,
  McpServerIn,
  Protocol,
  createMcpServer,
  slugifyName,
  validateMcpServer,
} from "@/lib/api";
import { useEnvironment } from "@/lib/environment";
import { useToast } from "@/components/Toast";
import { TagsInput } from "@/components/TagsInput";

export function McpServerForm() {
  const router = useRouter();
  const { showError } = useToast();
  const { namespace } = useEnvironment();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("STREAMABLE_HTTP");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [authValue, setAuthValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<McpProbeOut | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setProbe(null);
    try {
      setProbe(
        await validateMcpServer({
          url,
          protocol,
          auth_header: authValue ? authHeader || "Authorization" : undefined,
          auth_value: authValue || undefined,
        }),
      );
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input: McpServerIn = {
        name,
        namespace,
        url,
        protocol,
        description: description || undefined,
        tags,
        auth_header: authValue ? authHeader || "Authorization" : undefined,
        auth_value: authValue || undefined,
      };
      const result = await createMcpServer(input);
      router.push(`/mcp-servers/${result.namespace}/${result.name}`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to register MCP server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
      <div className="panel flex flex-col gap-4">
        <span className="mono-caption">Registration</span>
        <div>
          <label className="field-label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(slugifyName(e.target.value))}
            className="field-input font-mono"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="url">
            URL
          </label>
          <input
            id="url"
            required
            type="url"
            placeholder="https://example.com/mcp"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="field-input font-mono"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="protocol">
            Protocol
          </label>
          <select
            id="protocol"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as Protocol)}
            className="field-input"
          >
            <option value="STREAMABLE_HTTP">STREAMABLE_HTTP</option>
            <option value="SSE">SSE</option>
          </select>
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
          <label className="field-label">Tags</label>
          <TagsInput value={tags} onChange={setTags} />
        </div>
      </div>

      <div className="panel flex flex-col gap-4">
        <span className="mono-caption">Authentication (optional)</span>
        <div>
          <label className="field-label" htmlFor="auth-header">
            Header name
          </label>
          <input
            id="auth-header"
            placeholder="Authorization"
            value={authHeader}
            onChange={(e) => setAuthHeader(e.target.value)}
            className="field-input font-mono"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="auth-value">
            Value
          </label>
          <input
            id="auth-value"
            type="password"
            autoComplete="off"
            value={authValue}
            onChange={(e) => setAuthValue(e.target.value)}
            className="field-input"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>
            Stored as a cluster Secret, never shown again.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={testConnection}
          disabled={testing || !url}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Registering…" : "Register MCP server"}
        </button>
      </div>

      {probe && (
        <div className={`px-4 py-3 text-sm ${probe.reachable ? "panel-tint" : "panel-warning"}`}>
          {probe.reachable ? (
            <>
              <p className="font-medium" style={{ color: "var(--color-primary-hover)" }}>
                ✓ Reachable — {probe.tools.length} tools discovered
              </p>
              {probe.tools.length > 0 && (
                <p className="mt-1" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                  {probe.tools.map((t) => t.name).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: "var(--color-warning)" }}>✗ Not reachable: {probe.error}</p>
          )}
        </div>
      )}
    </form>
  );
}
