import { afterEach, describe, expect, it, vi } from "vitest";
import { EvolutionClient } from "@/lib/evolution/client";

describe("EvolutionClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("createInstance chama POST /instance/create com apikey e integration Baileys", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { instanceName: "org-abc", status: "created" }, hash: "tok-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const res = await client.createInstance("org-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/instance/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "admin-key" }),
        body: JSON.stringify({ instanceName: "org-abc", integration: "WHATSAPP-BAILEYS", qrcode: true }),
      }),
    );
    expect(res.instanceToken).toBe("tok-123");
  });

  it("createInstance trata 403 'already in use' como já existente (idempotente)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "already in use" }),
    );
    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    await expect(client.createInstance("org-abc")).resolves.toEqual({ instanceToken: null, alreadyExists: true });
  });

  it("connect chama GET /instance/connect/{name} e devolve o qrcode base64", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ base64: "data:image/png;base64,AAA=" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const qr = await client.connect("org-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/instance/connect/org-abc",
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "admin-key" }) }),
    );
    expect(qr).toBe("data:image/png;base64,AAA=");
  });

  it("getConnectionState mapeia 'open'→WORKING, 'connecting'→SCAN_QR_CODE, 'close'→STOPPED", async () => {
    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    for (const [raw, expected] of [
      ["open", "WORKING"],
      ["connecting", "SCAN_QR_CODE"],
      ["close", "STOPPED"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ instance: { state: raw } }) }),
      );
      await expect(client.getConnectionState("org-abc")).resolves.toBe(expected);
    }
  });

  it("sendText chama POST /message/sendText/{name} com number e text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: "3EB0ABC" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const res = await client.sendText("org-abc", "5531999998888", "oi");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/message/sendText/org-abc",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ number: "5531999998888", text: "oi" }),
      }),
    );
    expect(res).toEqual({ key: { id: "3EB0ABC" } });
  });

  describe("setWebhook", () => {
    it("chama POST /webhook/set/{name} com url e header-secreto exatos", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
      vi.stubGlobal("fetch", fetchMock);

      const client = new EvolutionClient("http://localhost:8080", "admin-key");
      await client.setWebhook(
        "org-abc",
        "https://crm.exemplo.com.br/api/v1/webhooks/evolution/tok123",
        "segredo-plaintext",
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8080/webhook/set/org-abc",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ apikey: "admin-key", "Content-Type": "application/json" }),
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: "https://crm.exemplo.com.br/api/v1/webhooks/evolution/tok123",
              headers: { "x-deskcomm-webhook-secret": "segredo-plaintext" },
            },
          }),
        }),
      );
    });

    it("lança evolution_webhook_set_<status> quando a Evolution recusa", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "invalid url" }),
      );
      const client = new EvolutionClient("http://localhost:8080", "admin-key");
      await expect(client.setWebhook("org-abc", "not-a-url", "s")).rejects.toThrow(
        "evolution_webhook_set_422",
      );
    });
  });
});
