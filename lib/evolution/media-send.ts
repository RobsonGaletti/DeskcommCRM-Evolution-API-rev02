// Plano de envio de mídia da Evolution API (Task 5). `OutboundMedia` é o
// mesmo tipo compartilhado que `lib/waha/media-send.ts` já expõe — ver
// `scripts/lint-channels.ts` (KNOWN_DEBT) sobre por que esse import não é
// acoplamento ao provider WAHA.
import type { OutboundMedia } from "@/lib/waha/media-send";

export interface EvolutionSendPlan {
  endpoint: "sendMedia" | "sendWhatsAppAudio";
  payload: Record<string, unknown>;
}

/** `mediatype` da Evolution: image | video | document (áudio tem endpoint próprio). */
function mediatypeFor(kind: string): string {
  if (kind === "image" || kind === "video") return kind;
  return "document";
}

export function evolutionSendPlanFor(kind: string, media: OutboundMedia): EvolutionSendPlan {
  if (kind === "audio") {
    return { endpoint: "sendWhatsAppAudio", payload: { audio: media.url } };
  }
  const payload: Record<string, unknown> = {
    mediatype: mediatypeFor(kind),
    mimetype: media.mime,
    media: media.url,
  };
  if (media.filename) payload.fileName = media.filename;
  if (media.caption) payload.caption = media.caption;
  return { endpoint: "sendMedia", payload };
}
