import { getEvolutionClient } from "@/lib/evolution/client";
import type { SessionLifecycleAdapter, SessionStatus } from "../session-lifecycle";

// Cache de QR por sessionRef, módulo-level, escopo de UM processo Node (o
// modelo v1 é "um servidor por instalação" — ver spec §2). Achado da revisão
// final (Important): a tela de onboarding faz poll de getStatus a poucos
// segundos, e sem cache cada poll chamaria `client.connect` de novo enquanto
// o status permanece SCAN_QR_CODE. Diferente do WAHA (status+QR numa única
// chamada estável), não sabemos se a Evolution trata `connect` repetido como
// "reiniciar o handshake" — se tratar, o QR trocaria antes do usuário
// conseguir escanear. Isto é MITIGAÇÃO defensiva, não confirmação: a validação
// real contra uma instância Evolution rodando continua pendente (mesma lacuna
// já conhecida — ver nota de fidelidade no topo de lib/evolution/ingest.ts).
// Limpo quando o status sai de SCAN_QR_CODE, pra uma reconexão futura buscar
// QR novo.
const qrCacheBySessionRef = new Map<string, string | null>();

export const evolutionLifecycleAdapter: SessionLifecycleAdapter = {
  provider: "evolution",

  async ensureSession(sessionRef: string, webhook?: { url: string; secret: string }): Promise<void> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    await client.createInstance(sessionRef);
    // Diferente do WAHA (webhook via env do container), a Evolution exige uma
    // chamada de API por instância pra saber pra onde mandar os eventos — sem
    // isto o fail-closed de `authenticateEvolutionWebhook` rejeita todo
    // webhook Evolution pra sempre (`missing_secret`). Só roda quando o
    // caller já tem o webhook montado (sessão nova) — `undefined` mantém a
    // função utilizável em contextos sem webhook ainda (ex.: testes).
    if (webhook) {
      await client.setWebhook(sessionRef, webhook.url, webhook.secret);
    }
  },

  async startSession(sessionRef: string): Promise<void> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    await client.connect(sessionRef);
  },

  async getStatus(sessionRef: string): Promise<SessionStatus> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    const status = await client.getConnectionState(sessionRef);
    // `phoneNumber` fica null aqui: a Evolution só devolve o número conectado
    // via /instance/fetchInstances, chamada separada que a Task 7 (UI) faz sob
    // demanda quando quer exibir — getStatus só cuida de status+QR.
    if (status !== "SCAN_QR_CODE") {
      qrCacheBySessionRef.delete(sessionRef);
      return { status, qrImageBase64: null, phoneNumber: null };
    }
    const cachedQr = qrCacheBySessionRef.get(sessionRef);
    if (cachedQr !== undefined) return { status, qrImageBase64: cachedQr, phoneNumber: null };
    const qr = await client.connect(sessionRef);
    qrCacheBySessionRef.set(sessionRef, qr);
    return { status, qrImageBase64: qr, phoneNumber: null };
  },

  // Mesmo pre-check síncrono que `evolutionAdapter` (envio) fará quando a Task 4
  // criar o `ChannelAdapter` de envio — aqui cobre o guard da rota de onboarding
  // antes de inserir a linha em `channel_sessions`.
  isConfigured(): boolean {
    return getEvolutionClient() !== null;
  },

  // A Evolution API v2 (documentação consultada nesta pesquisa) não expõe um
  // endpoint de "stop"/"restart" de instância com confiança — só create/delete/
  // connect/logout, e logout derruba a credencial (não é o que "gerar QR novo"
  // quer). Pra v1 este método é um NOOP seguro: reconectar chama `startSession`
  // de novo, que já é idempotente (POST /instance/connect apenas reemite o QR).
  // Se a pesquisa futura confirmar um endpoint de stop real, troque aqui.
  async stopSession(): Promise<void> {
    // Idempotente por definição: não faz nada, nunca lança.
  },
};
