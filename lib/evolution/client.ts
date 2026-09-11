/**
 * Client REST mínimo da Evolution API v2 — mesmo papel de `lib/waha/client.ts`
 * pro outro provider. Auth por header `apikey` (não `Authorization: Bearer`).
 *
 * `EVOLUTION_API_KEY` é a chave ADMIN da instalação (cria/gerencia instâncias)
 * e é a ÚNICA credencial usada hoje pra autenticar toda chamada de instância —
 * suficiente pro modelo v1 de "um servidor por instalação" (spec §2).
 *
 * `createInstance` devolve um `instanceToken` (campo `hash` da resposta), mas
 * HOJE esse valor não é persistido em lugar nenhum: `evolutionLifecycleAdapter.
 * ensureSession` (lib/channels/adapters/evolution-lifecycle.ts) chama
 * `createInstance` e descarta o retorno. `channel_sessions.evolution_token_
 * encrypted` (migration 0098) é uma coluna RESERVADA pra quando/se um wiring
 * de credencial por-instância for implementado — ainda não escrita por
 * nenhum código (ver comentário da coluna, adicionado na migration 0099).
 */
export interface EvolutionCreateInstanceResult {
  instanceToken: string | null;
  alreadyExists?: boolean;
}

export type EvolutionConnectionState = "STARTING" | "SCAN_QR_CODE" | "WORKING" | "STOPPED" | "FAILED";

/** Vocabulário cru da Evolution (`instance.state` / `CONNECTION_UPDATE.data.state`) → o nosso. Única fonte — reusada por lib/evolution/ingest.ts. */
export const EVOLUTION_STATE_MAP: Record<string, EvolutionConnectionState> = {
  open: "WORKING",
  connecting: "SCAN_QR_CODE",
  close: "STOPPED",
};

export class EvolutionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Idempotente: 403 "already in use"/409 tratados como já existente. */
  async createInstance(instanceName: string): Promise<EvolutionCreateInstanceResult> {
    const res = await fetch(`${this.baseUrl}/instance/create`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 409) return { instanceToken: null, alreadyExists: true };
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_create_${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as { hash?: string };
    return { instanceToken: body.hash ?? null };
  }

  /** GET /instance/connect/{name} — devolve o QR já em base64 (com prefixo data:image). */
  async connect(instanceName: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: this.apiKey },
    });
    if (!res.ok) throw new Error(`evolution_connect_${res.status}`);
    const body = (await res.json()) as { base64?: string; qrcode?: { base64?: string } };
    const raw = body.base64 ?? body.qrcode?.base64 ?? null;
    if (!raw) return null;
    return raw.startsWith("data:image") ? raw : `data:image/png;base64,${raw}`;
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    const res = await fetch(
      `${this.baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { headers: { apikey: this.apiKey } },
    );
    if (!res.ok) throw new Error(`evolution_state_${res.status}`);
    const body = (await res.json()) as { instance?: { state?: string } };
    return EVOLUTION_STATE_MAP[body.instance?.state ?? ""] ?? "STARTING";
  }

  async sendText(instanceName: string, number: string, text: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_send_${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async sendMedia(
    instanceName: string,
    number: string,
    plan: { endpoint: string; payload: Record<string, unknown> },
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/message/${plan.endpoint}/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, ...plan.payload }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_send_${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  /** Registra nosso endpoint de webhook na instância, com o header-secreto que authenticateEvolutionWebhook vai conferir. */
  async setWebhook(instanceName: string, webhookUrl: string, secretPlaintext: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: { "x-deskcomm-webhook-secret": secretPlaintext },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_webhook_set_${res.status}: ${body.slice(0, 200)}`);
    }
  }
}

export function getEvolutionClient(): EvolutionClient | null {
  const url = process.env.EVOLUTION_API_BASE_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return null;
  return new EvolutionClient(url, key);
}
