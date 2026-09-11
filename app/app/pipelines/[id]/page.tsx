import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PipelinePageClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) notFound();
  return <PipelinePageClient pipelineId={id} initialName={pipeline.name} />;
}
