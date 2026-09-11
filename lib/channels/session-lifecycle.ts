/**
 * Ciclo de vida de UMA sessão de canal — criar, iniciar, checar status/QR.
 *
 * Distinto de `ChannelAdapter` (types.ts): aquele é sobre ENVIAR mensagem numa
 * sessão já conectada; este é sobre CONECTAR a sessão em si. Até aqui só
 * existia pro WAHA, hardcoded em `app/api/v1/onboarding/whatsapp/session/route.ts`
 * — sem esta interface, Evolution vira um segundo caminho de código na tela em
 * vez de um segundo provider de verdade (doutrina restricao-de-canal.md,
 * invariante 1: nenhuma feature nomeia provider).
 */
import type { ChannelProvider } from "./types";

export interface SessionStatus {
  status: "STARTING" | "SCAN_QR_CODE" | "WORKING" | "STOPPED" | "FAILED";
  /** Presente só quando status === 'SCAN_QR_CODE'. Já em base64 pronto pro <img>. */
  qrImageBase64: string | null;
  /** Só dígitos, sem sufixo de domínio. null enquanto não há sessão conectada. */
  phoneNumber: string | null;
}

export interface SessionLifecycleAdapter {
  readonly provider: ChannelProvider;
  /**
   * Idempotente: cria a instância/sessão no provider se ainda não existir.
   *
   * `webhook` é OPCIONAL e só faz sentido pra providers que registram webhook
   * POR INSTÂNCIA via chamada de API (Evolution) — WAHA recebe URL/secret via
   * env do CONTAINER, configurada uma vez fora do código da app, então o
   * adapter dele ignora o parâmetro. Passar `undefined` (contexto sem o
   * webhook ainda montado, ex.: testes) é válido: a função continua criando a
   * sessão, só não registra webhook nenhum.
   */
  ensureSession(sessionRef: string, webhook?: { url: string; secret: string }): Promise<void>;
  /** Inicia a conexão (dispara geração de QR do lado do provider). Idempotente. */
  startSession(sessionRef: string): Promise<void>;
  getStatus(sessionRef: string): Promise<SessionStatus>;
  /** Espelha ChannelAdapter.isConfigured() (lib/channels/types.ts) — síncrono de propósito, mesmo contrato. */
  isConfigured(): boolean;
  /** Para a sessão (usado no fluxo de "gerar QR novo"). Idempotente: sessão já parada/inexistente não deve lançar. */
  stopSession(sessionRef: string): Promise<void>;
}
