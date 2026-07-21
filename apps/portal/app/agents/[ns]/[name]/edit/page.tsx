import { AgentEditLoader } from "@/components/AgentEditLoader";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ ns: string; name: string }>;
}) {
  const { ns, name } = await params;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Edit agent: {name}</h1>
      <AgentEditLoader namespace={ns} name={name} />
    </div>
  );
}
