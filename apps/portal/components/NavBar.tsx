"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function NavBar() {
  const pathname = usePathname();

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
        <span className="avatar-circle" aria-hidden="true" />
      </header>
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
    </div>
  );
}
