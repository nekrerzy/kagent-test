export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="surface rounded-md border-l-4 px-4 py-3 text-sm"
      style={{ borderLeftColor: "var(--danger)", color: "var(--danger)" }}
    >
      {message}
    </div>
  );
}
