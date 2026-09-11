import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { getSessionLifecycleAdapter, provisionWebhookSecret, type ChannelProvider } from "@/lib/channels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Onboarding WhatsApp session orchestration — genérico por provider (Task 7
 * do plano Evolution API: `getSessionLifecycleAdapter(provider)` no lugar de
 * `getWahaClient()` direto).
 *
 * GET  → devolve o status corrente (STARTING|SCAN_QR_CODE|WORKING|FAILED|STOPPED)
 * POST → inicia a sessão se ainda não estiver rodando. Idempotente.
 *
 * QR: pra WAHA continua vindo do proxy binário existente
 * (`/api/v1/onboarding/whatsapp/qr`, comportamento provado, não regredido).
 * Pra Evolution o QR já vem em base64 pronto no corpo desta rota
 * (`qr_image_base64`) — o client renderiza `<img>` direto, sem proxy.
 */

const VALID_PROVIDERS: ChannelProvider[] = ["waha", "evolution"];

function parseProvider(raw: unknown): ChannelProvider | null {
  return typeof raw === "string" && (VALID_PROVIDERS as string[]).includes(raw)
    ? (raw as ChannelProvider)
    : null;
}

function defaultSessionName(orgId: string): string {
  return `org_${orgId.slice(0, 8)}`;
}

function refColumnFor(provider: ChannelProvider): "waha_session_name" | "evolution_instance_name" {
  return provider === "evolution" ? "evolution_instance_name" : "waha_session_name";
}

class WebhookSecretUnavailableError extends Error {
  constructor() {
    super("webhook_secret_unavailable");
  }
}

interface EnsuredSession {
  id: string;
  isNew: boolean;
  /** Só presente quando isNew && provider precisa de webhook por API (Evolution). */
  webhook?: { url: string; secret: string };
}

/**
 * Garante a linha em `channel_sessions` pro (org, provider, sessionName).
 * Idempotente: sessão já existente é só lida — nenhum secret é regenerado
 * (o adendo da Task 7 provisiona o webhook só na CRIAÇÃO, não a cada POST).
 */
async function ensureChannelSession(
  orgId: string,
  sessionName: string,
  provider: ChannelProvider,
): Promise<EnsuredSession> {
  const supabase = await createClient();
  const refColumn = refColumnFor(provider);
  const { data: existing } = await supabase
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq(refColumn, sessionName)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string, isNew: false };

  const webhookPathToken = crypto.randomUUID().replace(/-/g, "");

  // WAHA: placeholder de 1 byte (o webhook secret real vem da env do
  // container, não desta coluna — dívida documentada, fora do escopo desta
  // task corrigir). Evolution: secret real, gerado e cifrado abaixo — NUNCA
  // o placeholder, porque Evolution não tem fallback via env.
  let webhookSecretEncrypted: string | Buffer = Buffer.from([0]);
  let webhook: { url: string; secret: string } | undefined;

  if (provider === "evolution") {
    const provisioned = await provisionWebhookSecret(createAdminClient(), provider, webhookPathToken);
    if (provisioned.needed) {
      if (!provisioned.ok) throw new WebhookSecretUnavailableError();
      webhookSecretEncrypted = provisioned.secretEncrypted;
      webhook = provisioned.webhook;
    }
  }

  const insertRow: Record<string, unknown> = {
    organization_id: orgId,
    webhook_path_token: webhookPathToken,
    webhook_secret_encrypted: webhookSecretEncrypted,
    status: "STARTING",
    last_status_change_at: new Date().toISOString(),
    consecutive_health_fails: 0,
    daily_message_limit: 250,
    metadata: {},
    provider,
    [refColumn]: sessionName,
  };
  // `engine` é coluna WAHA-específica (NOT NULL, default 'NOWEB', CHECK
  // NOWEB|WEBJS) — pra Evolution deixamos de fora do insert (nada fora do
  // fluxo WAHA lê essa coluna); gravar `null` violaria a CHECK.
  if (provider === "waha") insertRow.engine = "NOWEB";

  const { data: created, error } = await supabase
    .from("channel_sessions")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(`channel_session_insert_failed: ${error.message}`);
  return { id: created.id as string, isNew: true, webhook };
}

export async function GET(req: Request) {
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Sessão expirada", 401);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("tenant_not_found", "Sem organização ativa", 404);

  const providerRaw = new URL(req.url).searchParams.get("provider") ?? "waha";
  const provider = parseProvider(providerRaw);
  if (!provider) return fail("invalid_request", `provider inválido: ${providerRaw}`, 400);

  // Env-configuration guard: síncrono, sem chamada de rede, então roda antes
  // de qualquer operação de ciclo de vida tocar o provider.
  const adapter = getSessionLifecycleAdapter(provider);
  if (!adapter.isConfigured()) {
    return ok({ status: `${provider.toUpperCase()}_NOT_CONFIGURED`, session: null });
  }
  const sessionName = defaultSessionName(activeOrg.orgId);
  try {
    const remote = await adapter.getStatus(sessionName);
    return ok({ status: remote.status, session: sessionName, qr_image_base64: remote.qrImageBase64 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg.includes("404")) return ok({ status: "NOT_STARTED", session: sessionName });
    return ok({ status: "ERROR", session: sessionName, error: msg });
  }
}

export async function POST(req: Request) {
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Sessão expirada", 401);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("tenant_not_found", "Sem organização ativa", 404);

  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const providerRaw = body.provider ?? url.searchParams.get("provider") ?? "waha";
  const provider = parseProvider(providerRaw);
  if (!provider) return fail("invalid_request", `provider inválido: ${String(providerRaw)}`, 400);

  // Env-configuration guard precisa rodar ANTES de qualquer linha em
  // channel_sessions ser criada abaixo — síncrono, sem chamada de rede.
  const adapter = getSessionLifecycleAdapter(provider);
  if (!adapter.isConfigured()) {
    const hint =
      provider === "evolution"
        ? "Configure EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY e tente novamente."
        : "Suba o Docker (docker compose up -d waha) e tente novamente.";
    return fail(`${provider}_not_configured`, hint, 503);
  }
  const sessionName = defaultSessionName(activeOrg.orgId);

  // 1) Garante a linha em channel_sessions (e, se for Evolution nova, o
  // segredo real de webhook — ver adendo crítico da Task 7).
  let session: EnsuredSession;
  try {
    session = await ensureChannelSession(activeOrg.orgId, sessionName, provider);
  } catch (err) {
    if (err instanceof WebhookSecretUnavailableError) {
      return fail(
        "webhook_secret_unavailable",
        "Não foi possível gerar credencial segura de webhook — confirme que a GUC de criptografia está configurada nesta instalação.",
        503,
      );
    }
    const msg = err instanceof Error ? err.message : "unknown";
    return fail("internal_error", msg, 500);
  }

  // 1b) `?restart=1` = pedido explícito de QR novo. O start sozinho não
  // resolve uma sessão FAILED (o provider recusa "já existe" e o usuário fica
  // preso olhando um QR morto). O QR do WhatsApp expira em poucos minutos,
  // então "falhou, gere outro" é fluxo normal do onboarding, não exceção.
  if (url.searchParams.get("restart") === "1") {
    try {
      await adapter.stopSession(sessionName);
    } catch {
      // Sessão já parada/inexistente: seguir para o start é o comportamento certo.
    }
  }

  // 2) Garante a instância no provider (cria + registra webhook quando
  // aplicável) e inicia a conexão. Ambas chamadas são idempotentes.
  try {
    await adapter.ensureSession(sessionName, session.webhook);
    await adapter.startSession(sessionName);
    const remote = await adapter.getStatus(sessionName);
    return ok({
      status: remote.status,
      session: sessionName,
      channel_session_id: session.id,
      qr_image_base64: remote.qrImageBase64,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg.includes("422") || msg.includes("409")) {
      // Sessão já existe no provider — só busca status.
      const remote = await adapter.getStatus(sessionName);
      return ok({
        status: remote.status,
        session: sessionName,
        channel_session_id: session.id,
        qr_image_base64: remote.qrImageBase64,
      });
    }
    return NextResponse.json(
      { error: { code: `${provider}_start_failed`, message: msg } },
      { status: 502 },
    );
  }
}
