/**
 * LGPD redact cascade — invokes the SECURITY DEFINER RPC
 * `fn_lgpd_cascade_redact_contact` that performs the full anonymisation in
 * a single Postgres transaction.
 *
 * The RPC:
 *   - Short-circuits when contact is already anonymised (returns
 *     `already_anonymized: true`).
 *   - Mutates contacts (irreversible), conversations, messages,
 *     crm_lead_activities, crm_leads.
 *   - Strips personal fields from orders.payload but PRESERVES values.
 *   - Enqueues media paths into `storage_redaction_queue` for async deletion.
 *   - Inserts a dense `lgpd.redact_executed` audit row inside the TX.
 *
 * All tenant filtering is enforced at the RPC level (programmatic
 * organization_id check). The admin client bypasses RLS.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface CascadeResult {
  alreadyAnonymized: boolean;
  counts: Record<string, number>;
  mediaPaths: string[];
}

interface RpcResult {
  already_anonymized: boolean;
  counts?: Record<string, number>;
  media_paths?: string[];
}

export interface CascadeArgs {
  organizationId: string;
  contactId: string;
  requestId: string;
}

export async function cascadeRedactContact(args: CascadeArgs): Promise<CascadeResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("fn_lgpd_cascade_redact_contact" as never, {
    p_organization_id: args.organizationId,
    p_contact_id: args.contactId,
    p_request_id: args.requestId,
  } as never);

  if (error) {
    throw new Error(`[lgpd-redact-cascade] rpc failed: ${error.message}`);
  }

  const result = (data ?? {}) as RpcResult;
  return {
    alreadyAnonymized: result.already_anonymized === true,
    counts: result.counts ?? {},
    mediaPaths: result.media_paths ?? [],
  };
}
