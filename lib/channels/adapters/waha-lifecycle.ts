import { getWahaClient } from "@/lib/waha/client";
import type { SessionLifecycleAdapter, SessionStatus } from "../session-lifecycle";

interface WahaSessionResponse {
  status?: string;
  qr?: string;
  me?: { id?: string };
}

function toSessionStatus(raw: WahaSessionResponse): SessionStatus {
  const status = (raw.status as SessionStatus["status"]) ?? "STARTING";
  return {
    status,
    qrImageBase64: status === "SCAN_QR_CODE" ? (raw.qr ?? null) : null,
    phoneNumber: raw.me?.id ? raw.me.id.replace(/@.*$/, "") : null,
  };
}

export const wahaLifecycleAdapter: SessionLifecycleAdapter = {
  provider: "waha",

  async ensureSession(_sessionRef: string, _webhook?: { url: string; secret: string }): Promise<void> {
    // No-op síncrono de propósito (além do guard de configuração): `_webhook` é
    // ignorado porque WAHA recebe URL/secret via env do container, não por
    // chamada de API; e não chamamos `client.startSession` aqui porque a rota
    // de onboarding sempre chama `startSession` logo em seguida, que já cobre
    // criar+iniciar a sessão WAHA — repetir a chamada aqui duplicava a mesma
    // requisição HTTP contra o WAHA real a cada POST (achado do revisor da
    // Task 7, fix round 1).
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
  },

  async startSession(sessionRef: string): Promise<void> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    await client.startSession(sessionRef);
  },

  async getStatus(sessionRef: string): Promise<SessionStatus> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    const raw = (await client.getSessionQr(sessionRef)) as WahaSessionResponse;
    return toSessionStatus(raw);
  },

  // Mesmo pre-check que `wahaAdapter.isConfigured()` (../adapters/waha.ts) —
  // movido pro seam de ciclo de vida pro guard síncrono que a rota de
  // onboarding faz antes de inserir a linha em `channel_sessions`.
  isConfigured(): boolean {
    return getWahaClient() !== null;
  },

  async stopSession(sessionRef: string): Promise<void> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    await client.stopSession(sessionRef);
  },
};
