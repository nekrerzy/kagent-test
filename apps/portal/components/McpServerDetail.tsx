"use client";

import { useRouter } from "next/navigation";
import { deleteMcpServer, getMcpServer } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ReadyBadge, Tag } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";

export function McpServerDetail({ namespace, name }: { namespace: string; name: string }) {
  const router = useRouter();
  const { showError } = useToast();
  const { data: server, error, loading } = useApi(
    () => getMcpServer(namespace, name),
    [namespace, name],
  );

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!server) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="heading text-xl">{server.name}</h1>
            <ReadyBadge ready={server.ready} />
          </div>
          {server.description && (
            <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
              {server.description}
            </p>
          )}
          {server.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {server.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="pill">{server.protocol}</span>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-muted)" }}>
              {server.url}
            </code>
          </div>
        </div>
        <ConfirmButton
          label="Delete"
          confirmMessage={`Delete MCP server "${name}"? This cannot be undone.`}
          onConfirm={async () => {
            try {
              await deleteMcpServer(namespace, name);
              router.push("/");
            } catch (err) {
              showError(err instanceof Error ? err.message : "Delete failed");
            }
          }}
        />
      </div>

      <div>
        <h2 className="mono-caption mb-2">Discovered tools</h2>
        {server.discovered_tools.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No tools discovered yet.
          </p>
        ) : (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {server.discovered_tools.map((tool) => (
                  <tr key={tool.name}>
                    <td>
                      <span className="pill pill-tint">{tool.name}</span>
                    </td>
                    <td style={{ color: "var(--color-muted)" }}>{tool.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
