"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentOut, CatalogOut, McpServerOut, SkillOut } from "@/lib/api";
import { useMode } from "@/lib/mode";

type Section = "agents" | "mcp" | "skills";

function StatusDot({ ready }: { ready: boolean | null | undefined }) {
  return <span className={`status-dot ${ready === false ? "status-dot-warning" : "status-dot-success"}`} />;
}

// Renders up to 3 chips, collapsing the rest into a "+N" overflow chip —
// mirrors the "+1" overflow chip used in the Pro dense table.
function ChipRow({ chips }: { chips: { label: string; tint?: boolean }[] }) {
  if (chips.length === 0) return null;
  const shown = chips.slice(0, 3);
  const overflow = chips.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((chip, i) => (
        <span
          key={i}
          className={`quick-card-chip ${chip.tint ? "quick-card-chip-tint" : "quick-card-chip-muted"}`}
        >
          {chip.label}
        </span>
      ))}
      {overflow > 0 && <span className="quick-card-chip quick-card-chip-muted">+{overflow}</span>}
    </div>
  );
}

function AgentCards({ agents, loading }: { agents: AgentOut[]; loading: boolean }) {
  return (
    <>
      {agents.map((agent) => (
        <Link key={`${agent.namespace}/${agent.name}`} href={`/agents/${agent.namespace}/${agent.name}`} className="quick-card">
          <div className="flex items-center gap-2">
            <span className="quick-card-title">{agent.name}</span>
            <span className="ml-auto">
              <StatusDot ready={agent.ready} />
            </span>
          </div>
          <div className="quick-card-desc">{agent.description || "No description."}</div>
          <ChipRow chips={agent.tools.map((t) => ({ label: `◇ ${t.mcp_server}`, tint: true }))} />
        </Link>
      ))}
      {!loading && agents.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          No agents yet.
        </p>
      )}
      <Link href="/agents/new" className="quick-card-new">
        <span className="quick-card-new-icon">＋</span>
        <span className="quick-card-new-label">New agent</span>
      </Link>
    </>
  );
}

function McpCards({ servers, loading }: { servers: McpServerOut[]; loading: boolean }) {
  return (
    <>
      {servers.map((server) => (
        <Link
          key={`${server.namespace}/${server.name}`}
          href={`/mcp-servers/${server.namespace}/${server.name}`}
          className="quick-card"
        >
          <div className="flex items-center gap-2">
            <span className="quick-card-title">{server.name}</span>
            <span className="ml-auto">
              <StatusDot ready={server.ready} />
            </span>
          </div>
          <div className="quick-card-desc">{server.description || "No description."}</div>
          <ChipRow chips={server.discovered_tools.slice(0, 3).map((t) => ({ label: `▢ ${t.name}` }))} />
        </Link>
      ))}
      {!loading && servers.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          No MCP servers yet.
        </p>
      )}
      <Link href="/mcp-servers/new" className="quick-card-new">
        <span className="quick-card-new-icon">＋</span>
        <span className="quick-card-new-label">Register server</span>
      </Link>
    </>
  );
}

function SkillCards({ skills, loading }: { skills: SkillOut[]; loading: boolean }) {
  return (
    <>
      {skills.map((skill) => (
        <Link key={`${skill.namespace}/${skill.name}`} href="/skills" className="quick-card">
          <div className="flex items-center gap-2">
            <span className="quick-card-title">{skill.name}</span>
            <span className="ml-auto">
              <StatusDot ready />
            </span>
          </div>
          <div className="quick-card-desc">{skill.description || "No description."}</div>
          <ChipRow chips={skill.tags.slice(0, 3).map((tag) => ({ label: tag }))} />
        </Link>
      ))}
      {!loading && skills.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          No skills yet.
        </p>
      )}
      <Link href="/skills" className="quick-card-new">
        <span className="quick-card-new-icon">＋</span>
        <span className="quick-card-new-label">New skill</span>
      </Link>
    </>
  );
}

export function QuickHome({ data, loading }: { data: CatalogOut | undefined; loading: boolean }) {
  const router = useRouter();
  const { setMode } = useMode();
  const [prompt, setPrompt] = useState("");
  const [section, setSection] = useState<Section>("agents");

  const submitPrompt = () => {
    const text = prompt.trim();
    if (!text) return;
    router.push(`/agents/new?seed=${encodeURIComponent(text)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitPrompt();
    }
  };

  const agents = data?.agents ?? [];
  const mcpServers = data?.mcp_servers ?? [];
  const skills = data?.skills ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="quick-hero">
        <div className="quick-eyebrow">
          <span className="quick-eyebrow-dot" />
          PLATFORM AGENT
        </div>
        <div className="quick-headline">Let&rsquo;s build your next agent.</div>

        <div className="quick-prompt-card">
          <textarea
            className="quick-prompt-textarea"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what it should do, and who it's for…"
          />
          <div className="quick-prompt-row">
            <Link href="/skills" className="quick-chip-btn">
              ＋ Attach context
            </Link>
            <Link href="/mcp-servers/new" className="quick-chip-btn">
              ◇ Connect a tool
            </Link>
            <div className="flex-1" />
            <button
              type="button"
              className="quick-send-btn"
              onClick={submitPrompt}
              disabled={!prompt.trim()}
              aria-label="Create agent"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="segmented">
          <button
            type="button"
            className={`segmented-tab ${section === "agents" ? "segmented-tab-active" : ""}`}
            onClick={() => setSection("agents")}
          >
            <span className="segmented-icon-dot" />
            Agents <span className="segmented-tab-count">{agents.length}</span>
          </button>
          <button
            type="button"
            className={`segmented-tab ${section === "mcp" ? "segmented-tab-active" : ""}`}
            onClick={() => setSection("mcp")}
          >
            <span className="segmented-icon-diamond" />
            MCP <span className="segmented-tab-count">{mcpServers.length}</span>
          </button>
          <button
            type="button"
            className={`segmented-tab ${section === "skills" ? "segmented-tab-active" : ""}`}
            onClick={() => setSection("skills")}
          >
            <span className="segmented-icon-square" />
            Skills <span className="segmented-tab-count">{skills.length}</span>
          </button>
        </div>
        <div className="flex-1" />
        <button type="button" className="segmented-view-all" onClick={() => setMode("pro")}>
          View all →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {section === "agents" && <AgentCards agents={agents} loading={loading} />}
        {section === "mcp" && <McpCards servers={mcpServers} loading={loading} />}
        {section === "skills" && <SkillCards skills={skills} loading={loading} />}
      </div>
    </div>
  );
}
