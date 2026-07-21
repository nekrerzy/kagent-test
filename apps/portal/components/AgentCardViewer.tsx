"use client";

import { getAgentCard } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBanner } from "@/components/ErrorBanner";
import { JsonViewer } from "@/components/JsonViewer";

export function AgentCardViewer({ namespace, name }: { namespace: string; name: string }) {
  const { data, error, loading } = useApi(() => getAgentCard(namespace, name), [namespace, name]);

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading agent card…</p>;
  if (error) return <ErrorBanner message={`Agent card unavailable: ${error}`} />;
  if (!data) return null;

  return <JsonViewer title="Agent card (A2A)" data={data} />;
}
