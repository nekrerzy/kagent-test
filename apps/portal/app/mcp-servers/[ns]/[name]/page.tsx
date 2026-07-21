import { McpServerDetail } from "@/components/McpServerDetail";

export default async function McpServerDetailPage({
  params,
}: {
  params: Promise<{ ns: string; name: string }>;
}) {
  const { ns, name } = await params;
  return <McpServerDetail namespace={ns} name={name} />;
}
