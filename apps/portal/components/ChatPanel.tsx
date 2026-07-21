"use client";

import { useState } from "react";
import { ApiError, streamAgent } from "@/lib/api";
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
  const [activity, setActivity] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { role: "user", text }, { role: "agent", text: "" }]);
    setInput("");
    setBusy(true);
    setActivity("thinking…");

    // Events carry full-text snapshots, so each one replaces the last bubble.
    const setAgentText = (t: string) =>
      setMessages((m) => {
        const next = m.slice();
        next[next.length - 1] = { role: "agent", text: t };
        return next;
      });

    try {
      await streamAgent(
        namespace,
        name,
        { text, session_id: sessionId },
        (event) => {
          if (event.error) {
            showError(event.error);
            return;
          }
          if (event.tool) setActivity(`calling tool ${event.tool}…`);
          if (typeof event.text === "string" && event.text) {
            setActivity(null);
            setAgentText(event.text);
          }
          if (event.done && event.context_id) setSessionId(event.context_id);
        },
      );
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Invoke failed");
      // drop the empty placeholder bubble if nothing ever streamed in
      setMessages((m) =>
        m.length && m[m.length - 1].role === "agent" && !m[m.length - 1].text
          ? m.slice(0, -1)
          : m,
      );
    } finally {
      setBusy(false);
      setActivity(null);
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
          {messages.map((msg, i) =>
            msg.role === "agent" && !msg.text ? null : (
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
            ),
          )}
          {busy && activity && (
            <div
              className="max-w-[85%] rounded-md px-3 py-2 text-sm"
              style={{ alignSelf: "flex-start", background: "var(--border)", color: "var(--muted)" }}
            >
              {activity}
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
