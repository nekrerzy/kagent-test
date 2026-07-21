"use client";

import { useState } from "react";
import { ApiError, invokeAgent } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Message {
  role: "user" | "agent";
  text: string;
}

export function ChatPanel({ namespace, name }: { namespace: string; name: string }) {
  const { showError } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const result = await invokeAgent(namespace, name, {
        text,
        session_id: sessionId,
      });
      if (result.context_id) setSessionId(result.context_id);
      setMessages((m) => [...m, { role: "agent", text: result.text }]);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Invoke failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface flex h-[32rem] flex-col rounded-lg">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Say something to start a conversation with this agent.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className="max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap"
              style={
                msg.role === "user"
                  ? { alignSelf: "flex-end", background: "var(--accent)", color: "var(--accent-foreground)" }
                  : { alignSelf: "flex-start", background: "var(--border)" }
              }
            >
              {msg.text}
            </div>
          ))}
          {busy && (
            <div
              className="max-w-[85%] rounded-md px-3 py-2 text-sm"
              style={{ alignSelf: "flex-start", background: "var(--border)", color: "var(--muted)" }}
            >
              thinking…
            </div>
          )}
        </div>
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the agent…"
          className="field-input"
          disabled={busy}
        />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
