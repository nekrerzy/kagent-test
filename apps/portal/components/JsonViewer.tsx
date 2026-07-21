"use client";

import { useState } from "react";

/** Collapsible pretty-printed JSON block, e.g. for an AgentCard. */
export function JsonViewer({
  title,
  data,
}: {
  title: string;
  data: unknown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="surface rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        {title}
        <span style={{ color: "var(--muted)" }}>{open ? "▾ collapse" : "▸ expand"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t px-4 py-3 text-xs" style={{ borderColor: "var(--border)" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
