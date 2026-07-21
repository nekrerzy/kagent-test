import { AgentForm } from "@/components/AgentForm";

export default function NewAgentPage() {
  return (
    <div>
      <h1 className="heading mb-6 text-xl">New agent</h1>
      <AgentForm mode="new" />
    </div>
  );
}
