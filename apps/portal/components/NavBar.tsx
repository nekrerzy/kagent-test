"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnvironment } from "@/lib/environment";
import { useMode } from "@/lib/mode";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api";

// "Agents" and "MCP Servers" don't have dedicated list pages — they live as
// sections on the catalog home — so their tabs jump to that section via a
// hash anchor. Skills and Model Configs have real standalone pages.
const tabs: { href: string; label: string; match: (pathname: string) => boolean }[] = [
  {
    href: "/#agents",
    label: "Agents",
    match: (p) => p === "/" || p.startsWith("/agents"),
  },
  {
    href: "/#mcp-servers",
    label: "MCP Servers",
    match: (p) => p.startsWith("/mcp-servers"),
  },
  { href: "/skills", label: "Skills", match: (p) => p.startsWith("/skills") },
  {
    href: "/model-configs",
    label: "Model Configs",
    match: (p) => p.startsWith("/model-configs"),
  },
];

function EnvSwitcher() {
  const { namespace, environments, setNamespace, addEnvironment } = useEnvironment();
  const { showError } = useToast();

  const options = environments.length > 0 ? environments.map((e) => e.name) : [namespace];

  const handleAdd = async () => {
    const raw = window.prompt("New environment name");
    if (!raw) return;
    try {
      await addEnvironment(raw);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to create environment");
    }
  };

  return (
    <div className="env-switcher">
      {options.map((env) => (
        <button
          key={env}
          type="button"
          className={`env-pill ${env === namespace ? "env-pill-active" : ""}`}
          onClick={() => setNamespace(env)}
        >
          {env}
        </button>
      ))}
      <button type="button" className="env-pill env-pill-add" onClick={handleAdd}>
        + env
      </button>
    </div>
  );
}

function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
    <div className="mode-toggle">
      <button
        type="button"
        className={`mode-pill ${mode === "quick" ? "mode-pill-active-light" : ""}`}
        onClick={() => setMode("quick")}
      >
        Quick
      </button>
      <button
        type="button"
        className={`mode-pill ${mode === "pro" ? "mode-pill-active-dark" : ""}`}
        onClick={() => setMode("pro")}
      >
        Pro
      </button>
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { mode } = useMode();
  const isHome = pathname === "/";
  // Quick mode is one calm screen on home: no environment switcher, no tab
  // nav. Off the home route, the tab nav stays so navigation keeps working.
  const showEnvSwitcher = mode === "pro";
  const showTabNav = mode === "pro" || !isHome;

  return (
    <div className="sticky top-0 z-40">
      <header className="top-bar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <span className="brand-mark-dot" />
          </span>
          <span className="brand-name">Open Agents</span>
        </Link>
        <div className="flex-1" />
        {showEnvSwitcher && <EnvSwitcher />}
        <ModeToggle />
        <span className="avatar-circle" aria-hidden="true" />
      </header>
      {showTabNav && (
        <nav className="tab-nav">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={`tab-link ${tab.match(pathname) ? "tab-link-active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
