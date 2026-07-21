"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Catalog" },
  { href: "/agents/new", label: "Agents: new" },
  { href: "/mcp-servers/new", label: "MCP Servers: new" },
  { href: "/model-configs", label: "Model Configs" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="surface border-b" style={{ borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Agents Platform
        </Link>
        <div className="flex gap-4 text-sm">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "font-medium" : ""}
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
