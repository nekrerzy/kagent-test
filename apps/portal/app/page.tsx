"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCatalog } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEnvironment } from "@/lib/environment";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ReadyBadge, Tag } from "@/components/Badge";

function CatalogPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const searchRef = useRef<HTMLInputElement>(null);
  const { namespace } = useEnvironment();

  const { data, error, loading } = useApi(
    () => getCatalog(q || undefined, namespace),
    [q, namespace],
  );

  // ⌘K / Ctrl+K focuses the search bar, like the command-bar treatment in
  // the design reference.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (draft) params.set("q", draft);
    router.push(params.size ? `/?${params}` : "/");
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="cmdk-bar flex-1">
          <span className="cmdk-kbd">⌘K</span>
          <input
            ref={searchRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="search agents, MCP servers, model configs…"
          />
          {q && (
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: "var(--color-muted-2)" }}
              onClick={() => {
                setDraft("");
                router.push("/");
              }}
            >
              clear
            </button>
          )}
        </form>
        <div className="flex gap-2">
          <Link href="/mcp-servers/new" className="btn-secondary">
            + MCP server
          </Link>
          <Link href="/agents/new" className="btn-primary">
            + New agent
          </Link>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {data?.mcp_endpoint && (
        <div className="panel-tint flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <span className="font-medium" style={{ color: "var(--color-primary-hover)" }}>
            Federated MCP endpoint
          </span>
          <span style={{ color: "var(--color-muted)" }}>— all registered servers, one URL:</span>
          <code
            className="select-all rounded-[6px] bg-white px-2 py-0.5"
            style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-ink)" }}
          >
            {data.mcp_endpoint}
          </code>
        </div>
      )}

      <Section id="agents" title="Agents" count={data?.agents.length} loading={loading}>
        {data?.agents.length ? (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th>Version</th>
                  <th className="text-right">Runs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((agent) => (
                  <tr key={`${agent.namespace}/${agent.name}`}>
                    <td>
                      <Link
                        href={`/agents/${agent.namespace}/${agent.name}`}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={`status-dot ${
                            agent.ready === true
                              ? "status-dot-success"
                              : agent.ready === false
                                ? "status-dot-warning"
                                : "status-dot-muted"
                          }`}
                        />
                        <span className="name-mono">{agent.name}</span>
                      </Link>
                    </td>
                    <td style={{ color: "var(--color-muted)" }}>{agent.description || "—"}</td>
                    <td>
                      {agent.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {agent.tags.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>
                      {agent.version != null ? `v${agent.version}` : "—"}
                    </td>
                    <td className="text-right" style={{ fontFamily: "var(--font-mono)" }}>
                      {agent.runs != null ? agent.runs : "—"}
                    </td>
                    <td>
                      <ReadyBadge ready={agent.ready} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty label="No agents yet." href="/agents/new" cta="Create one" />
        )}
      </Section>

      <Section id="mcp-servers" title="MCP Servers" count={data?.mcp_servers.length} loading={loading}>
        {data?.mcp_servers.length ? (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Server</th>
                  <th>Description</th>
                  <th>Protocol</th>
                  <th>Auth</th>
                  <th>Tools</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.mcp_servers.map((server) => (
                  <tr key={`${server.namespace}/${server.name}`}>
                    <td>
                      <Link
                        href={`/mcp-servers/${server.namespace}/${server.name}`}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={`status-dot ${
                            server.ready === true
                              ? "status-dot-success"
                              : server.ready === false
                                ? "status-dot-warning"
                                : "status-dot-muted"
                          }`}
                        />
                        <span className="name-mono">{server.name}</span>
                      </Link>
                    </td>
                    <td style={{ color: "var(--color-muted)" }}>{server.description || "—"}</td>
                    <td>
                      <span className="pill">{server.protocol}</span>
                    </td>
                    <td>
                      {server.auth_header ? (
                        <span className="pill" style={{ fontFamily: "var(--font-mono)" }}>
                          {server.auth_header}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-muted-3)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{server.discovered_tools.length}</td>
                    <td>
                      <ReadyBadge ready={server.ready} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <Empty label="No MCP servers yet." href="/mcp-servers/new" cta="Register one" />
          )
        )}
      </Section>

      <Section id="model-configs" title="Model Configs" count={data?.model_configs.length} loading={loading}>
        {data?.model_configs.length ? (
          <Grid>
            {data.model_configs.map((mc) => (
              <div key={`${mc.namespace}/${mc.name}`} className="card-link">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="heading text-sm">{mc.name}</h3>
                  <ReadyBadge ready={mc.ready} />
                </div>
                <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                  {mc.provider} · {mc.model}
                </p>
              </div>
            ))}
          </Grid>
        ) : (
          !loading && (
            <Empty
              label="No model configs yet."
              href="/model-configs"
              cta="Create one"
            />
          )
        )}
      </Section>

      <Section id="skills" title="Skills" count={data?.skills.length} loading={loading}>
        {data?.skills.length ? (
          <Grid>
            {data.skills.map((skill) => (
              <Link
                key={`${skill.namespace}/${skill.name}`}
                href="/skills"
                className="card-link"
              >
                <h3 className="heading text-sm">{skill.name}</h3>
                {skill.description && (
                  <p className="mt-1.5 text-sm" style={{ color: "var(--color-muted)" }}>
                    {skill.description}
                  </p>
                )}
                {skill.path && (
                  <p className="mt-1.5" style={{ color: "var(--color-muted-3)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {skill.path}
                  </p>
                )}
                {skill.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {skill.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </Grid>
        ) : (
          !loading && <Empty label="No skills yet." href="/skills" cta="Add one" />
        )}
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  count,
  loading,
  children,
}: {
  id: string;
  title: string;
  count: number | undefined;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="heading text-lg">{title}</h2>
        {typeof count === "number" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-muted-3)" }}>
            {count}
          </span>
        )}
        {loading && <span className="text-xs" style={{ color: "var(--color-muted)" }}>loading…</span>}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Empty({ label, href, cta }: { label: string; href: string; cta: string }) {
  return (
    <div className="surface rounded-[var(--radius-lg)] px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
      <p>{label}</p>
      <Link href={href} className="mt-2 inline-block font-medium" style={{ color: "var(--color-primary)" }}>
        {cta} →
      </Link>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense>
      <CatalogPageInner />
    </Suspense>
  );
}
