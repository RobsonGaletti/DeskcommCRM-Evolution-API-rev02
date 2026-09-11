/**
 * Knowledge version lifecycle helpers for the RAG indexer.
 *
 * All queries use the admin (service-role) client and filter organization_id
 * explicitly — service-role bypasses RLS, so tenant isolation is enforced here.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateVersionParams {
  agentId: string;
  organizationId: string;
  sourceType: string;
}

export interface CreateVersionResult {
  versionId: string;
  versionNumber: number;
}

/**
 * Creates a new `ai_knowledge_versions` row in `status='building'`.
 * Version number is max+1 for this agent+org pair.
 */
export async function createKnowledgeVersion(
  params: CreateVersionParams,
): Promise<CreateVersionResult> {
  const admin = createAdminClient();

  // Resolve the current max version_number for this agent+org.
  const { data: maxRow, error: maxErr } = await admin
    .from("ai_knowledge_versions")
    .select("version_number")
    .eq("agent_id", params.agentId)
    .eq("organization_id", params.organizationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    throw new Error(`createKnowledgeVersion: query failed — ${maxErr.message}`);
  }

  const nextVersionNumber = ((maxRow?.version_number as number | null) ?? 0) + 1;

  const { data: inserted, error: insertErr } = await admin
    .from("ai_knowledge_versions")
    .insert({
      agent_id: params.agentId,
      organization_id: params.organizationId,
      version_number: nextVersionNumber,
      description: `Auto-indexed via ${params.sourceType}`,
      status: "building",
      is_active: false,
    })
    .select("id, version_number")
    .single();

  if (insertErr || !inserted) {
    throw new Error(`createKnowledgeVersion: insert failed — ${insertErr?.message ?? "no row"}`);
  }

  return {
    versionId: (inserted as { id: string; version_number: number }).id,
    versionNumber: (inserted as { id: string; version_number: number }).version_number,
  };
}

/**
 * Marks a version as `ready` and updates `total_chunks` + `indexed_at`.
 */
export async function markVersionReady(
  versionId: string,
  organizationId: string,
  chunkCount: number,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("ai_knowledge_versions")
    .update({
      status: "ready",
      total_chunks: chunkCount,
      indexed_at: new Date().toISOString(),
    })
    .eq("id", versionId)
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`markVersionReady: update failed — ${error.message}`);
  }
}

/**
 * Marks a version as `failed` with an error message.
 */
export async function markVersionFailed(
  versionId: string,
  organizationId: string,
  errorMessage: string,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("ai_knowledge_versions")
    .update({
      status: "failed",
      error_message: errorMessage,
    })
    .eq("id", versionId)
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`markVersionFailed: update failed — ${error.message}`);
  }
}

/**
 * Activates a version via the `activate_kb_version` RPC.
 * Pre-checks that the version belongs to the org before calling.
 */
export async function activateVersion(params: {
  agentId: string;
  versionId: string;
  organizationId: string;
}): Promise<void> {
  const admin = createAdminClient();

  // Tenant isolation pre-check: confirm version belongs to this org+agent.
  const { data: versionRow, error: checkErr } = await admin
    .from("ai_knowledge_versions")
    .select("id")
    .eq("id", params.versionId)
    .eq("agent_id", params.agentId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (checkErr) {
    throw new Error(`activateVersion: pre-check failed — ${checkErr.message}`);
  }
  if (!versionRow) {
    throw new Error(
      `activateVersion: version ${params.versionId} not found for org ${params.organizationId}`,
    );
  }

  const { error: rpcErr } = await admin.rpc("activate_kb_version" as never, {
    p_agent_id: params.agentId,
    p_version_id: params.versionId,
  } as never);

  if (rpcErr) {
    throw new Error(`activateVersion: RPC failed — ${rpcErr.message}`);
  }
}
