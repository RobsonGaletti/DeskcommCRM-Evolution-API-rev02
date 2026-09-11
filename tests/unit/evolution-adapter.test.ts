import { describe, expect, it, vi, beforeEach } from "vitest";

const sendText = vi.fn();
const sendMedia = vi.fn();

vi.mock("@/lib/evolution/client", () => ({
  getEvolutionClient: () => ({ sendText, sendMedia }),
}));

import { evolutionAdapter } from "@/lib/channels/adapters/evolution";

describe("evolutionAdapter", () => {
  beforeEach(() => {
    sendText.mockReset();
    sendMedia.mockReset();
  });

  it("resolveRecipient devolve só dígitos, sem sufixo, pra número; groupChatId cru pra grupo", () => {
    expect(
      evolutionAdapter.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: "+55 31 99999-8888",
        waIdentity: null,
      }),
    ).toBe("5531999998888");
    expect(
      evolutionAdapter.resolveRecipient({
        isGroup: true,
        groupChatId: "12036@g.us",
        phoneNumber: null,
        waIdentity: null,
      }),
    ).toBe("12036@g.us");
    expect(
      evolutionAdapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null }),
    ).toBeNull();
  });

  it("send de texto extrai o externalId de key.id", async () => {
    sendText.mockResolvedValue({ key: { id: "3EB0ABC" } });
    const res = await evolutionAdapter.send({
      sessionRef: "org-abc",
      to: "5531999998888",
      kind: "text",
      body: "oi",
    });
    expect(sendText).toHaveBeenCalledWith("org-abc", "5531999998888", "oi");
    expect(res).toEqual({ externalId: "3EB0ABC" });
  });

  it("send sem client configurado devolve externalId null (noop, não exceção)", async () => {
    vi.doMock("@/lib/evolution/client", () => ({ getEvolutionClient: () => null }));
    vi.resetModules();
    const { evolutionAdapter: adapterSemConfig } = await import("@/lib/channels/adapters/evolution");
    const res = await adapterSemConfig.send({ sessionRef: "x", to: "y", kind: "text", body: "oi" });
    expect(res).toEqual({ externalId: null });
  });
});
