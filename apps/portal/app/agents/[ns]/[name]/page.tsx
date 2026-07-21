import { AgentDetail } from "@/components/AgentDetail";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ ns: string; name: string }>;
}) {
  const { ns, name } = await params;
  return <AgentDetail namespace={ns} name={name} />;
}
