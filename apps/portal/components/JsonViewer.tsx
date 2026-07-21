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
    <div className="surface rounded-[var(--radius-lg)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold"
      >
        {title}
        <span className="mono-caption normal-case tracking-normal">{open ? "▾ collapse" : "▸ expand"}</span>
      </button>
      {open && (
        <pre
          className="code-block overflow-x-auto rounded-t-none rounded-b-[var(--radius-lg)] px-4 py-3 text-xs"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
