import { describe, expect, it, vi, beforeEach } from "vitest";

const createInstance = vi.fn();
const connect = vi.fn();
const getConnectionState = vi.fn();
const setWebhook = vi.fn();

let evolutionClientConfigured = true;

vi.mock("@/lib/evolution/client", () => ({
  getEvolutionClient: () =>
    evolutionClientConfigured ? { createInstance, connect, getConnectionState, setWebhook } : null,
}));

import { evolutionLifecycleAdapter } from "@/lib/channels/adapters/evolution-lifecycle";

describe("evolutionLifecycleAdapter", () => {
  beforeEach(() => {
    createInstance.mockReset();
    connect.mockReset();
    getConnectionState.mockReset();
    setWebhook.mockReset();
    evolutionClientConfigured = true;
  });

  it("ensureSession cria a instância", async () => {
    createInstance.mockResolvedValue({ instanceToken: "tok" });
    await evolutionLifecycleAdapter.ensureSession("org-abc");
    expect(createInstance).toHaveBeenCalledWith("org-abc");
    expect(setWebhook).not.toHaveBeenCalled();
  });

  it("ensureSession registra o webhook depois de criar a instância, quando webhook é passado", async () => {
    const calls: string[] = [];
    createInstance.mockImplementation(async () => {
      calls.push("createInstance");
      return { instanceToken: "tok" };
    });
    setWebhook.mockImplementation(async () => {
      calls.push("setWebhook");
    });
    const webhook = { url: "https://crm.exemplo.com.br/api/v1/webhooks/evolution/tok123", secret: "s3cr3t" };

    await evolutionLifecycleAdapter.ensureSession("org-abc", webhook);

    expect(createInstance).toHaveBeenCalledWith("org-abc");
    expect(setWebhook).toHaveBeenCalledWith("org-abc", webhook.url, webhook.secret);
    // Ordem importa: setWebhook só depois de createInstance.
    expect(calls).toEqual(["createInstance", "setWebhook"]);
  });

  it("startSession chama connect", async () => {
    connect.mockResolvedValue("data:image/png;base64,AAA=");
    await evolutionLifecycleAdapter.startSession("org-abc");
    expect(connect).toHaveBeenCalledWith("org-abc");
  });

  it("getStatus combina connect (QR) + getConnectionState quando SCAN_QR_CODE", async () => {
    getConnectionState.mockResolvedValue("SCAN_QR_CODE");
    connect.mockResolvedValue("data:image/png;base64,AAA=");
    const status = await evolutionLifecycleAdapter.getStatus("org-abc");
    expect(status).toEqual({ status: "SCAN_QR_CODE", qrImageBase64: "data:image/png;base64,AAA=", phoneNumber: null });
  });

  it("getStatus não busca QR quando WORKING", async () => {
    getConnectionState.mockResolvedValue("WORKING");
    const status = await evolutionLifecycleAdapter.getStatus("org-abc");
    expect(connect).not.toHaveBeenCalled();
    expect(status).toEqual({ status: "WORKING", qrImageBase64: null, phoneNumber: null });
  });

  it("isConfigured reflete getEvolutionClient() !== null", () => {
    evolutionClientConfigured = true;
    expect(evolutionLifecycleAdapter.isConfigured()).toBe(true);

    evolutionClientConfigured = false;
    expect(evolutionLifecycleAdapter.isConfigured()).toBe(false);
  });

  it("stopSession é um noop seguro que não lança (Evolution não expõe stop/restart de instância)", async () => {
    await expect(evolutionLifecycleAdapter.stopSession("org-abc")).resolves.toBeUndefined();
  });

  // Achado da revisão final (Important): getStatus chamava client.connect() de
  // novo a cada poll enquanto SCAN_QR_CODE — se a Evolution tratar `connect`
  // repetido como reiniciar o handshake, o QR trocaria antes do usuário
  // conseguir escanear. Mitigação: cache de QR em memória por sessionRef,
  // module-level em evolution-lifecycle.ts. Cada teste abaixo usa um
  // sessionRef PRÓPRIO pra não vazar estado do cache entre casos (o cache é
  // module-level e não é resetado pelo beforeEach).
  describe("cache de QR (mitigação de polling agressivo)", () => {
    it("primeira chamada com SCAN_QR_CODE chama connect e cacheia o QR", async () => {
      getConnectionState.mockResolvedValue("SCAN_QR_CODE");
      connect.mockResolvedValue("data:image/png;base64,FIRST=");

      const status = await evolutionLifecycleAdapter.getStatus("org-qr-cache-1");

      expect(connect).toHaveBeenCalledTimes(1);
      expect(status).toEqual({ status: "SCAN_QR_CODE", qrImageBase64: "data:image/png;base64,FIRST=", phoneNumber: null });
    });

    it("segunda chamada com SCAN_QR_CODE não chama connect de novo, devolve o QR cacheado", async () => {
      getConnectionState.mockResolvedValue("SCAN_QR_CODE");
      connect.mockResolvedValue("data:image/png;base64,ORIGINAL=");

      const first = await evolutionLifecycleAdapter.getStatus("org-qr-cache-2");
      expect(connect).toHaveBeenCalledTimes(1);

      // Se a Evolution devolvesse um QR novo numa 2ª chamada de connect, isto
      // provaria que o cache (e não coincidência) é quem barrou a chamada.
      connect.mockResolvedValue("data:image/png;base64,WOULD_BE_DIFFERENT=");
      const second = await evolutionLifecycleAdapter.getStatus("org-qr-cache-2");

      expect(connect).toHaveBeenCalledTimes(1); // não chamou de novo
      expect(second).toEqual(first);
      expect(second.qrImageBase64).toBe("data:image/png;base64,ORIGINAL=");
    });

    it("quando o status muda pra WORKING, o cache é limpo — voltar a SCAN_QR_CODE chama connect de novo", async () => {
      getConnectionState.mockResolvedValue("SCAN_QR_CODE");
      connect.mockResolvedValue("data:image/png;base64,BEFORE=");
      await evolutionLifecycleAdapter.getStatus("org-qr-cache-3");
      expect(connect).toHaveBeenCalledTimes(1);

      getConnectionState.mockResolvedValue("WORKING");
      const working = await evolutionLifecycleAdapter.getStatus("org-qr-cache-3");
      expect(working).toEqual({ status: "WORKING", qrImageBase64: null, phoneNumber: null });
      expect(connect).toHaveBeenCalledTimes(1); // WORKING não busca QR

      getConnectionState.mockResolvedValue("SCAN_QR_CODE");
      connect.mockResolvedValue("data:image/png;base64,AFTER=");
      const scanAgain = await evolutionLifecycleAdapter.getStatus("org-qr-cache-3");

      expect(connect).toHaveBeenCalledTimes(2); // cache foi limpo, buscou de novo
      expect(scanAgain.qrImageBase64).toBe("data:image/png;base64,AFTER=");
    });
  });
});
