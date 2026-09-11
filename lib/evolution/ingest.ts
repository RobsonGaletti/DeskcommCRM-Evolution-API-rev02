/**
 * Pipeline de ingestão da Evolution — mesmo contrato interno de
 * `lib/waha/ingest.ts` (dispatchWahaEvent), formato de payload diferente.
 * Reusa as MESMAS RPCs atômicas (fn_upsert_wa_contact/fn_upsert_wa_conversation/
 * fn_mark_conversation_message) — o resto do pipeline (timeline, disparo do
 * agente) não sabe e não deve saber de onde a mensagem veio.
 *
 * remoteJid segue o padrão Baileys (mesma lib que o WAHA/NOWEB usa por baixo):
 * `{numero}@s.whatsapp.net` | `{lid}@lid` | `{id}@g.us`.
 *
 * ⚠️ NOTA DE FIDELIDADE (ver task-6-brief.md): o formato de `EvolutionMessageData`
 * abaixo (`data.key.remoteJid/fromMe/id`, `data.pushName`, `data.message.conversation`,
 * `data.messageType`, `data.messageTimestamp`) vem de múltiplas fontes públicas
 * consistentes da Evolution API v2, mas NÃO foi confirmado contra uma instância
 * Evolution real rodando (não há stack Docker da Evolution disponível nesta sessão
 * — chega só na Task 8). Isto é a MELHOR ESTIMATIVA disponível, tratada como
 * código de produção normal, com testes cobrindo o formato assumido. Validação
 * ao vivo (Step 6 do brief) fica como ação pendente pós-Task 8: subir a stack
 * Evolution real, capturar um MESSAGES_UPSERT/CONNECTION_UPDATE genuíno, e
 * comparar campo a campo com o parser abaixo antes de considerar o pipeline de
 * ingestão pronto pra produção. Se algo divergir, documentar aqui como
 * "medido ao vivo em <data>: campo X vem como Y, não Z".
 */
import { audit } from "@/lib/audit";
import { EVOLUTION_STATE_MAP } from "@/lib/evolution/client";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

interface Session {
  id: string;
  organization_id: string;
}

export type ChatIdentity =
  | { kind: "phone"; phone: string; lid: null }
  | { kind: "lid"; phone: null; lid: string }
  | { kind: "group"; phone: null; lid: null };

export function parseRemoteJid(jid: string): ChatIdentity {
  if (jid.endsWith("@g.us")) return { kind: "group", phone: null, lid: null };
  if (jid.endsWith("@lid")) return { kind: "lid", phone: null, lid: jid.replace(/@.*$/, "") };
  if (jid.endsWith("@s.whatsapp.net")) {
    const digits = jid.replace(/@.*$/, "").replace(/^\+/, "");
    return { kind: "phone", phone: "+" + digits, lid: null };
  }
  return { kind: "group", phone: null, lid: null };
}

const MESSAGE_KEY_TYPE: Record<string, string> = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
};

/** `messageType` cru da Evolution → vocabulário de messages.type do CRM. */
export function resolveEvolutionMessageType(messageType: string, messageObj: Record<string, unknown>): string {
  if (messageType in MESSAGE_KEY_TYPE) return MESSAGE_KEY_TYPE[messageType]!;
  if (messageType === "conversation" || messageType === "extendedTextMessage") return "text";
  for (const key of Object.keys(MESSAGE_KEY_TYPE)) {
    if (key in messageObj) return MESSAGE_KEY_TYPE[key]!;
  }
  return "text";
}

function bodyOf(message: Record<string, unknown>): string | null {
  if (typeof message.conversation === "string") return message.conversation;
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  return null;
}

interface EvolutionMessageData {
  key: { remoteJid: string; fromMe: boolean; id: string };
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
}

export interface EvolutionEnvelope {
  event?: string;
  data?: EvolutionMessageData | { state?: string };
}

async function upsertContact(
  admin: Admin,
  orgId: string,
  parsed: ChatIdentity,
  jid: string,
  notifyName: string | null,
): Promise<string | null> {
  if (parsed.kind === "group") return null;
  const { data, error } = await admin.rpc("fn_upsert_wa_contact" as never, {
    p_org: orgId,
    p_kind: parsed.kind,
    p_phone: parsed.kind === "phone" ? parsed.phone : null,
    p_lid: parsed.kind === "lid" ? parsed.lid : null,
    p_chat_id: jid,
    p_notify: notifyName ?? null,
  } as never);
  if (error) {
    console.error("[evolution.ingest] fn_upsert_wa_contact failed", error.message);
    return null;
  }
  return (data as string) ?? null;
}

async function upsertConversation(admin: Admin, orgId: string, contactId: string, sessionId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("fn_upsert_wa_conversation" as never, {
    p_org: orgId,
    p_contact: contactId,
    p_session: sessionId,
  } as never);
  if (error) {
    console.error("[evolution.ingest] fn_upsert_wa_conversation failed", error.message);
    return null;
  }
  return (data as string) ?? null;
}

const STOP_RX = /\b(STOP|PARAR|SAIR|UNSUBSCRIBE)\b/i;

async function handleInbound(admin: Admin, session: Session, data: EvolutionMessageData, requestId: string): Promise<void> {
  if (data.key.fromMe) return; // outbound do próprio operador: Task futura, fora do v1 (spec §10 não lista — ver nota abaixo)
  const parsed = parseRemoteJid(data.key.remoteJid);
  if (parsed.kind === "group") return;
  const body = data.message ? bodyOf(data.message) : null;
  if (!body) return; // v1: só texto. Mídia inbound entra quando o worker de persist assinar este pipeline (Task 5 cobre só outbound + fetch cru).

  const contactId = await upsertContact(admin, session.organization_id, parsed, data.key.remoteJid, data.pushName ?? null);
  if (!contactId) return;
  const conversationId = await upsertConversation(admin, session.organization_id, contactId, session.id);
  if (!conversationId) return;

  const now = new Date().toISOString();
  const type = resolveEvolutionMessageType(data.messageType ?? "conversation", data.message ?? {});
  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      organization_id: session.organization_id,
      conversation_id: conversationId,
      channel_session_id: session.id,
      contact_id: contactId,
      external_id: data.key.id,
      type,
      direction: "inbound",
      status: "delivered",
      body,
      sent_via: "external_device",
      sent_at: data.messageTimestamp ? new Date(data.messageTimestamp * 1000).toISOString() : now,
      delivered_at: now,
      metadata: { raw_message_type: data.messageType },
    })
    .select("id")
    .maybeSingle();

  if (insertErr && insertErr.code !== "23505") {
    console.error("[evolution.ingest] message insert failed", insertErr.message);
    return;
  }
  if (insertErr?.code === "23505") return;

  await admin.rpc("fn_mark_conversation_message" as never, {
    p_conv: conversationId,
    p_direction: "inbound",
    p_preview: body.slice(0, 280),
    p_at: now,
  } as never);

  if (body && STOP_RX.test(body)) {
    await admin.from("contacts").update({ is_blocked: true, blocked_reason: "stop_keyword", blocked_at: now }).eq("id", contactId);
    await audit({
      action: "contact.blocked",
      organizationId: session.organization_id,
      resourceType: "contact",
      requestId,
      metadata: { reason: "stop_keyword", contact_id: contactId },
    });
  }

  await audit({
    action: "message.received",
    organizationId: session.organization_id,
    resourceType: "message",
    requestId,
    metadata: { conversation_id: conversationId, type, external_id: data.key.id },
  });

  if (inserted?.id) {
    const inboundMessageId = inserted.id;
    await admin
      .rpc("emit_event" as never, {
        p_event_type: "ai_agent.dispatch_requested",
        p_entity_kind: "message",
        p_entity_id: inboundMessageId,
        p_payload: {
          organization_id: session.organization_id,
          conversation_id: conversationId,
          contact_id: contactId,
          channel_session_id: session.id,
          inbound_message_id: inboundMessageId,
        },
        p_metadata: { source: "evolution_webhook", request_id: requestId },
        p_organization_id: session.organization_id,
      } as never)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error("[evolution.ingest] emit dispatch_requested failed", error.message);
      });
  }
}

async function handleConnectionUpdate(admin: Admin, session: Session, data: { state?: string }): Promise<void> {
  const status = EVOLUTION_STATE_MAP[data.state ?? ""];
  if (!status) return;
  await admin.from("channel_sessions").update({ status, last_status_change_at: new Date().toISOString() }).eq("id", session.id);
}

export async function dispatchEvolutionEvent(admin: Admin, session: Session, envelope: EvolutionEnvelope, requestId: string): Promise<void> {
  const eventType = (envelope.event ?? "").toUpperCase();
  if (eventType === "MESSAGES_UPSERT") {
    await handleInbound(admin, session, envelope.data as EvolutionMessageData, requestId);
  } else if (eventType === "CONNECTION_UPDATE") {
    await handleConnectionUpdate(admin, session, envelope.data as { state?: string });
  }
  // MESSAGES_UPDATE (ack de entrega/leitura) e mensagem fromMe=true (operador
  // respondeu direto do celular) ficam para uma segunda iteração: o formato
  // exato do payload MESSAGES_UPDATE não foi confirmado contra uma instância
  // real durante este plano (ver nota de fidelidade no topo da Task 6) — captura
  // ao vivo primeiro (Step 6), parser depois.
}
