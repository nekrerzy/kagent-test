export function ReadyBadge({ ready }: { ready: boolean | null | undefined }) {
  const label = ready === true ? "ready" : ready === false ? "not ready" : "unknown";
  const color =
    ready === true
      ? { bg: "rgba(34,197,94,0.15)", fg: "#22c55e" }
      : ready === false
        ? { bg: "rgba(248,113,113,0.15)", fg: "var(--danger)" }
        : { bg: "rgba(148,163,184,0.15)", fg: "var(--muted)" };

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: color.bg, color: color.fg }}
    >
      {label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
      style={{ background: "var(--border)", color: "var(--muted)" }}
    >
      {children}
    </span>
  );
}
