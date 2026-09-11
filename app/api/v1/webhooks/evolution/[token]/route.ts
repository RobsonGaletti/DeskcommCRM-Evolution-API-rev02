/**
 * POST /api/v1/webhooks/evolution/[token]
 *
 * Espelha app/api/v1/webhooks/waha/[token]/route.ts: lookup por
 * webhook_path_token -> autentica (header-secreto, não HMAC — ver
 * lib/evolution/webhook-auth.ts) -> loga em webhook_events_log ->
 * dispatchEvolutionEvent.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEvolutionEvent, type EvolutionEnvelope } from "@/lib/evolution/ingest";
import { authenticateEvolutionWebhook } from "@/lib/evolution/webhook-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;
  if (!token || token.length < 8) return fail("not_found", "unknown webhook token", 404, { requestId });

  const rawBody = await req.text();
  let envelope: EvolutionEnvelope;
  try {
    envelope = JSON.parse(rawBody) as EvolutionEnvelope;
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: session, error: sessErr } = await admin
    .from("channel_sessions")
    .select("id, organization_id, evolution_instance_name, webhook_secret_encrypted, status")
    .eq("webhook_path_token", token)
    .maybeSingle();

  if (sessErr) return fail("internal_error", sessErr.message, 500, { requestId });
  if (!session) return fail("not_found", "unknown webhook token", 404, { requestId });

  const secretHeader = req.headers.get("x-deskcomm-webhook-secret");
  let sessionSecret: string | null = null;
  try {
    const dec = await admin.rpc("fn_decrypt_oauth", { ciphertext: session.webhook_secret_encrypted });
    if (!dec.error && typeof dec.data === "string") sessionSecret = dec.data;
  } catch {
    sessionSecret = null;
  }

  const auth = authenticateEvolutionWebhook({ secretHeader, sessionSecret });
  if (!auth.ok) {
    await audit({
      action: "webhook.hmac_invalid",
      organizationId: session.organization_id,
      metadata: { provider: "evolution", session: session.evolution_instance_name, event: envelope.event, reason: auth.reason },
    });
    return fail("unauthenticated", auth.reason, 401, { requestId });
  }

  const headersJson: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("authorization") || key.toLowerCase() === "cookie") return;
    headersJson[key] = value;
  });
  await admin.from("webhook_events_log").insert({
    organization_id: session.organization_id,
    channel_session_id: session.id,
    provider: "evolution",
    webhook_path_token: token,
    http_method: "POST",
    headers: headersJson,
    raw_body: rawBody,
    payload_parsed: envelope as unknown as Record<string, unknown>,
    signature_header: secretHeader ?? null,
    valid_signature: true,
    event_type: envelope.event ?? "unknown",
    status: "received",
    attempts: 0,
  });

  try {
    await dispatchEvolutionEvent(admin, session, envelope, requestId);
  } catch (err) {
    console.error("[evolution.webhook] handler failed", err);
  }

  return ok({ accepted: true }, { requestId });
}
