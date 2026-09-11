import { describe, expect, it } from "vitest";
import { evolutionSendPlanFor } from "@/lib/evolution/media-send";

describe("evolutionSendPlanFor", () => {
  it("image/video/document usam sendMedia com mediatype certo", () => {
    const media = { url: "https://x/img.jpg", mime: "image/jpeg", caption: "legenda" };
    expect(evolutionSendPlanFor("image", media)).toEqual({
      endpoint: "sendMedia",
      payload: { mediatype: "image", mimetype: "image/jpeg", media: "https://x/img.jpg", caption: "legenda" },
    });
  });

  it("audio usa sendWhatsAppAudio, sem mediatype", () => {
    const media = { url: "https://x/audio.ogg", mime: "audio/ogg" };
    expect(evolutionSendPlanFor("audio", media)).toEqual({
      endpoint: "sendWhatsAppAudio",
      payload: { audio: "https://x/audio.ogg" },
    });
  });

  it("document inclui fileName quando presente", () => {
    const media = { url: "https://x/doc.pdf", mime: "application/pdf", filename: "contrato.pdf" };
    expect(evolutionSendPlanFor("document", media)).toEqual({
      endpoint: "sendMedia",
      payload: { mediatype: "document", mimetype: "application/pdf", media: "https://x/doc.pdf", fileName: "contrato.pdf" },
    });
  });
});
