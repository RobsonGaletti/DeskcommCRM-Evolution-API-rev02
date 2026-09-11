import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactDetailClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!contact) notFound();
  return <ContactDetailClient contactId={id} />;
}
