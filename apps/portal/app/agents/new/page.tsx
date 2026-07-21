import { AgentForm } from "@/components/AgentForm";

export default function NewAgentPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">New agent</h1>
      <AgentForm mode="new" />
    </div>
  );
}
