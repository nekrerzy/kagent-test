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
          <div className="flex items-center gap-2.5">
            <h1 className="heading text-xl">{agent.name}</h1>
            <ReadyBadge ready={agent.ready} />
            <Tag>{agent.type ?? "Declarative"}</Tag>
          </div>
          {agent.description && (
            <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
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
            <p className="mt-2" style={{ color: "var(--color-muted-3)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
              A2A URL: {agent.a2a_url}
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

      {agent.type === "BYO" ? (
        <div className="panel flex flex-col gap-2">
          <span className="mono-caption">Image</span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>{agent.image}</p>
        </div>
      ) : (
        <>
          <div className="panel flex flex-col gap-2">
            <span className="mono-caption">System message</span>
            <pre className="code-block whitespace-pre-wrap p-3">{agent.system_message}</pre>
          </div>

          <div className="panel flex flex-col gap-2">
            <span className="mono-caption">Tools</span>
            {agent.tools.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                No tools attached.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {agent.tools.map((t) => (
                  <li key={t.mcp_server} className="flex items-center gap-2">
                    <span className="pill pill-tint">{t.mcp_server}</span>
                    <span style={{ color: "var(--color-muted)" }}>
                      {t.tool_names ? t.tool_names.join(", ") : "all tools"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="panel flex flex-col gap-2">
        <span className="mono-caption">Skills</span>
        {agent.skills.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No skills attached.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {agent.skills.map((s) => (
              <li key={s.image ? `img::${s.image}` : `${s.url}::${s.path ?? ""}`}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {s.name || s.url || s.image}
                </span>
                {s.path && <span style={{ color: "var(--color-muted)" }}> · {s.path}</span>}
                {s.ref && <span style={{ color: "var(--color-muted)" }}> @ {s.ref}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AgentCardViewer namespace={namespace} name={name} />

      <div>
        <h2 className="mono-caption mb-2">Playground</h2>
        <ChatPanel namespace={namespace} name={name} />
      </div>
    </div>
  );
}
