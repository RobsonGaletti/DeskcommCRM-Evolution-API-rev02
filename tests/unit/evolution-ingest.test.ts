import { describe, expect, it, vi } from "vitest";

// ingest.ts importa @/lib/audit (→ supabase/server → validação de env);
// os helpers puros testados aqui não deveriam pagar esse custo — mesmo padrão
// de tests/unit/waha-ingest-media.test.ts pro pipeline irmão do WAHA.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { parseRemoteJid, resolveEvolutionMessageType, dispatchEvolutionEvent } from "@/lib/evolution/ingest";

describe("parseRemoteJid", () => {
  it("@s.whatsapp.net vira phone E.164", () => {
    expect(parseRemoteJid("5531999998888@s.whatsapp.net")).toEqual({ kind: "phone", phone: "+5531999998888", lid: null });
  });
  it("@g.us vira group", () => {
    expect(parseRemoteJid("12036@g.us")).toEqual({ kind: "group", phone: null, lid: null });
  });
  it("@lid vira lid", () => {
    expect(parseRemoteJid("998877@lid")).toEqual({ kind: "lid", phone: null, lid: "998877" });
  });
});

describe("resolveEvolutionMessageType", () => {
  it("conversation/extendedTextMessage → text", () => {
    expect(resolveEvolutionMessageType("conversation", {})).toBe("text");
    expect(resolveEvolutionMessageType("extendedTextMessage", {})).toBe("text");
  });
  it("imageMessage/audioMessage/videoMessage/documentMessage/stickerMessage mapeiam 1:1", () => {
    expect(resolveEvolutionMessageType("imageMessage", {})).toBe("image");
    expect(resolveEvolutionMessageType("audioMessage", {})).toBe("audio");
    expect(resolveEvolutionMessageType("videoMessage", {})).toBe("video");
    expect(resolveEvolutionMessageType("documentMessage", {})).toBe("document");
    expect(resolveEvolutionMessageType("stickerMessage", {})).toBe("sticker");
  });
  it("tipo desconhecido cai em text", () => {
    expect(resolveEvolutionMessageType("pollCreationMessage", {})).toBe("text");
  });
});

describe("dispatchEvolutionEvent — MESSAGES_UPSERT inbound", () => {
  it("insere mensagem, contato e conversa via RPC, e emite ai_agent.dispatch_requested", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "id-fake", error: null });
    const insertSelect = vi.fn().mockResolvedValue({ data: { id: "msg-1" }, error: null });
    const admin = {
      rpc,
      from: vi.fn(() => ({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: insertSelect })) })),
      })),
    } as unknown as Parameters<typeof dispatchEvolutionEvent>[0];

    const session = { id: "sess-1", organization_id: "org-1" };
    const envelope = {
      event: "MESSAGES_UPSERT",
      data: {
        key: { remoteJid: "5531999998888@s.whatsapp.net", fromMe: false, id: "3EB0C7B4" },
        pushName: "John Doe",
        message: { conversation: "oi" },
        messageType: "conversation",
        messageTimestamp: 1709553296,
      },
    };

    await dispatchEvolutionEvent(admin, session as never, envelope as never, "req-1");

    expect(rpc).toHaveBeenCalledWith(
      "fn_upsert_wa_contact",
      expect.objectContaining({ p_org: "org-1", p_kind: "phone", p_phone: "+5531999998888" }),
    );
  });
});
