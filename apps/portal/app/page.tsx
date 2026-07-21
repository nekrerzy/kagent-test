"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCatalog } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ReadyBadge, Tag } from "@/components/Badge";

function CatalogPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(q);

  const { data, error, loading } = useApi(() => getCatalog(q || undefined), [q]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (draft) params.set("q", draft);
    router.push(params.size ? `/?${params}` : "/");
  };

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search agents, MCP servers, model configs…"
          className="field-input max-w-lg"
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
        {q && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setDraft("");
              router.push("/");
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error && <ErrorBanner message={error} />}

      <Section title="Agents" loading={loading}>
        {data?.agents.length ? (
          <Grid>
            {data.agents.map((agent) => (
              <Link
                key={`${agent.namespace}/${agent.name}`}
                href={`/agents/${agent.namespace}/${agent.name}`}
                className="card-link"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{agent.name}</h3>
                  <ReadyBadge ready={agent.ready} />
                </div>
                {agent.description && (
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {agent.description}
                  </p>
                )}
                {agent.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {agent.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </Grid>
        ) : (
          !loading && <Empty label="No agents yet." href="/agents/new" cta="Create one" />
        )}
      </Section>

      <Section title="MCP Servers" loading={loading}>
        {data?.mcp_servers.length ? (
          <Grid>
            {data.mcp_servers.map((server) => (
              <Link
                key={`${server.namespace}/${server.name}`}
                href={`/mcp-servers/${server.namespace}/${server.name}`}
                className="card-link"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{server.name}</h3>
                  <ReadyBadge ready={server.ready} />
                </div>
                {server.description && (
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {server.description}
                  </p>
                )}
                <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                  {server.discovered_tools.length} tool
                  {server.discovered_tools.length === 1 ? "" : "s"}
                  {server.discovered_tools.length > 0 &&
                    `: ${server.discovered_tools
                      .slice(0, 4)
                      .map((t) => t.name)
                      .join(", ")}${server.discovered_tools.length > 4 ? "…" : ""}`}
                </p>
              </Link>
            ))}
          </Grid>
        ) : (
          !loading && (
            <Empty label="No MCP servers yet." href="/mcp-servers/new" cta="Register one" />
          )
        )}
      </Section>

      <Section title="Model Configs" loading={loading}>
        {data?.model_configs.length ? (
          <Grid>
            {data.model_configs.map((mc) => (
              <div key={`${mc.namespace}/${mc.name}`} className="card-link">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{mc.name}</h3>
                  <ReadyBadge ready={mc.ready} />
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
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
    </div>
  );
}

function Section({
  title,
  loading,
  children,
}: {
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {loading && <span className="text-xs" style={{ color: "var(--muted)" }}>loading…</span>}
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
    <div className="surface rounded-lg px-4 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
      <p>{label}</p>
      <Link href={href} className="mt-2 inline-block" style={{ color: "var(--accent)" }}>
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
