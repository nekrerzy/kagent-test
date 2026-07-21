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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{server.name}</h1>
            <ReadyBadge ready={server.ready} />
          </div>
          {server.description && (
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
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
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {server.protocol} · <code>{server.url}</code>
          </p>
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
        <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Discovered tools
        </h2>
        {server.discovered_tools.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No tools discovered yet.
          </p>
        ) : (
          <div className="surface overflow-x-auto rounded-md">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {server.discovered_tools.map((tool) => (
                  <tr key={tool.name} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-mono text-xs">{tool.name}</td>
                    <td className="px-3 py-2" style={{ color: "var(--muted)" }}>
                      {tool.description ?? "—"}
                    </td>
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
