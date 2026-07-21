"use client";

import { getAgent } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBanner } from "@/components/ErrorBanner";
import { AgentForm } from "@/components/AgentForm";

export function AgentEditLoader({ namespace, name }: { namespace: string; name: string }) {
  const { data: agent, error, loading } = useApi(() => getAgent(namespace, name), [namespace, name]);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!agent) return null;

  return <AgentForm mode="edit" namespace={namespace} initial={agent} />;
}
