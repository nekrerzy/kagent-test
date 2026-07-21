import { AgentEditLoader } from "@/components/AgentEditLoader";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ ns: string; name: string }>;
}) {
  const { ns, name } = await params;

  return (
    <div>
      <h1 className="heading mb-6 text-xl">
        Edit agent: <span style={{ fontFamily: "var(--font-mono)" }}>{name}</span>
      </h1>
      <AgentEditLoader namespace={ns} name={name} />
    </div>
  );
}
