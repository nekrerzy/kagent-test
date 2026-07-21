"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteAgent, getAgent } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/Toast";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ReadyBadge, Tag } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AgentCardViewer } from "@/components/AgentCardViewer";
import { ChatPanel } from "@/components/ChatPanel";

export function AgentDetail({ namespace, name }: { namespace: string; name: string }) {
  const router = useRouter();
  const { showError } = useToast();
  const { data: agent, error, loading } = useApi(() => getAgent(namespace, name), [namespace, name]);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!agent) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{agent.name}</h1>
            <ReadyBadge ready={agent.ready} />
          </div>
          {agent.description && (
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {agent.description}
            </p>
          )}
          {agent.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agent.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          )}
          {agent.a2a_url && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              A2A URL: <code>{agent.a2a_url}</code>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${namespace}/${name}/edit`} className="btn-secondary">
            Edit
          </Link>
          <ConfirmButton
            label="Delete"
            confirmMessage={`Delete agent "${name}"? This cannot be undone.`}
            onConfirm={async () => {
              try {
                await deleteAgent(namespace, name);
                router.push("/");
              } catch (err) {
                showError(err instanceof Error ? err.message : "Delete failed");
              }
            }}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
          System message
        </h2>
        <pre className="surface whitespace-pre-wrap rounded-md p-3 text-sm">
          {agent.system_message}
        </pre>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Tools
        </h2>
        {agent.tools.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No tools attached.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {agent.tools.map((t) => (
              <li key={t.mcp_server}>
                <span className="font-medium">{t.mcp_server}</span>
                {t.tool_names ? `: ${t.tool_names.join(", ")}` : ": all tools"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AgentCardViewer namespace={namespace} name={name} />

      <div>
        <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Playground
        </h2>
        <ChatPanel namespace={namespace} name={name} />
      </div>
    </div>
  );
}
