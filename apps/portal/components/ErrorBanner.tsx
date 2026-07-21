export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-[var(--radius-md)] bg-white px-4 py-3 text-sm"
      style={{
        color: "var(--color-danger)",
        border: "1px solid var(--color-border)",
        borderLeft: "4px solid var(--color-danger)",
      }}
    >
      {message}
    </div>
  );
}
