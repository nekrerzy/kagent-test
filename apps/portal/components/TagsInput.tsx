"use client";

import { useState } from "react";

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Simple chips input: type a tag, press Enter or comma to add it. */
export function TagsInput({ value, onChange }: TagsInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div className="field-input flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          style={{ background: "var(--border)", color: "var(--muted)" }}
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove ${tag}`}
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) {
            const tag = e.target.value.slice(0, -1).trim();
            if (tag && !value.includes(tag)) onChange([...value, tag]);
            setDraft("");
          } else {
            setDraft(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length ? "" : "add a tag…"}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
