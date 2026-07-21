export function ReadyBadge({ ready }: { ready: boolean | null | undefined }) {
  const label = ready === true ? "ready" : ready === false ? "not ready" : "unknown";
  const dotClass =
    ready === true ? "status-dot-success" : ready === false ? "status-dot-warning" : "status-dot-muted";
  const color =
    ready === true ? "var(--color-success)" : ready === false ? "var(--color-warning)" : "var(--color-muted-3)";

  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "10.5px", color }}
    >
      <span className={`status-dot ${dotClass}`} />
      {label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="pill">{children}</span>;
}
