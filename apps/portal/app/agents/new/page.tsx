import { Suspense } from "react";
import { AgentForm } from "@/components/AgentForm";

export default function NewAgentPage() {
  return (
    <div>
      <h1 className="heading mb-6 text-xl">New agent</h1>
      <Suspense>
        <AgentForm mode="new" />
      </Suspense>
    </div>
  );
}
