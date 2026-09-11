/**
 * Autenticação do webhook Evolution — fail-closed, igual em espírito ao WAHA
 * (lib/waha/webhook-auth.ts), mas SEM HMAC de corpo: a Evolution não assina o
 * payload nativamente (só suporta `headers` customizados no /webhook/set), então
 * a defesa aqui é comparar um header-secreto compartilhado com
 * `crypto.timingSafeEqual` — mais fraco que HMAC-do-corpo (não prova
 * integridade do payload, só posse do secret), mas sem timing leak. Diferente
 * do WAHA, NÃO existe modo "sem assinatura, aceita mesmo assim": sem header
 * secreto a rota rejeita sempre, porque não há alternativa "Core não assina"
 * aqui — o header é a única defesa que existe.
 */
import { timingSafeEqual } from "node:crypto";

export type EvolutionWebhookAuth = { ok: true } | { ok: false; reason: "bad_secret" | "missing_secret" };

export interface EvolutionWebhookAuthInput {
  secretHeader: string | null;
  /** Segredo por sessão já decifrado (null quando não há/não decifrou). */
  sessionSecret: string | null;
}

export function authenticateEvolutionWebhook(input: EvolutionWebhookAuthInput): EvolutionWebhookAuth {
  const { secretHeader, sessionSecret } = input;
  if (!secretHeader || !sessionSecret) return { ok: false, reason: "missing_secret" };
  const a = Buffer.from(secretHeader, "utf8");
  const b = Buffer.from(sessionSecret, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "bad_secret" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_secret" };
}
