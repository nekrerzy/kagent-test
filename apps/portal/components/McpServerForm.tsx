"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, McpServerIn, Protocol, createMcpServer, slugifyName } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { TagsInput } from "@/components/TagsInput";

export function McpServerForm() {
  const router = useRouter();
  const { showError } = useToast();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("STREAMABLE_HTTP");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input: McpServerIn = {
        name,
        url,
        protocol,
        description: description || undefined,
        tags,
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
      <div>
        <label className="field-label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(slugifyName(e.target.value))}
          className="field-input"
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
          className="field-input"
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

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Registering…" : "Register MCP server"}
        </button>
      </div>
    </form>
  );
}
