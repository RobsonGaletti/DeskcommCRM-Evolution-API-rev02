/**
 * Provisiona o segredo real de webhook por sessão, pros providers que
 * precisam registrar webhook via chamada de API (Evolution) em vez de env do
 * container (WAHA). Fonte única pra não duplicar esta lógica entre as rotas
 * que criam `channel_sessions` (onboarding e conexões).
 *
 * Task 7 do plano Evolution API (2026-09-10), adendo crítico: a revisão da
 * Task 6 achou que NADA gerava `webhook_secret_encrypted` de verdade nem
 * chamava a API da Evolution pra registrar nosso endpoint — sem isto,
 * `authenticateEvolutionWebhook` (lib/evolution/webhook-auth.ts) rejeita TODO
 * webhook Evolution pra sempre com `missing_secret`. A feature compilava e
 * testava verde, mas nunca recebia mensagem nenhuma em produção.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import type { ChannelProvider } from "./types";

export type ProvisionWebhookResult =
  | { needed: false }
  | { needed: true; ok: true; secretEncrypted: string; webhook: { url: string; secret: string } }
  | { needed: true; ok: false };

/**
 * `needed: false` pra providers cujo webhook NÃO passa por aqui (WAHA via env
 * do container, meta_cloud não tem "sessão" nesse sentido) — o caller usa o
 * placeholder de 1 byte que já usa hoje pra esses casos (dívida documentada
 * do WAHA, fora do escopo desta função corrigir).
 *
 * `needed: true, ok: false` quando a cifra está indisponível (GUC ausente) —
 * o caller NUNCA deve gravar um secret inutilizável nesse caso: Evolution não
 * tem fallback via env como o WAHA, então um secret ruim aqui é pior que
 * recusar a criação da sessão.
 */
export async function provisionWebhookSecret(
  admin: SupabaseClient,
  provider: ChannelProvider,
  webhookPathToken: string,
): Promise<ProvisionWebhookResult> {
  if (provider !== "evolution") return { needed: false };

  const secretPlaintext = randomBytes(32).toString("hex");
  const encrypted = await encryptWebhookSecret(admin, secretPlaintext);
  if (encrypted === null) return { needed: true, ok: false };

  return {
    needed: true,
    ok: true,
    secretEncrypted: encrypted,
    webhook: {
      url: `${env.NEXT_PUBLIC_APP_URL}/api/v1/webhooks/evolution/${webhookPathToken}`,
      secret: secretPlaintext,
    },
  };
}
