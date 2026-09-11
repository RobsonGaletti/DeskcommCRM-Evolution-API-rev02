/**
 * Adapter Evolution — mesmo papel burro do `waha.ts`: traduz formato e
 * delega ao `EvolutionClient`. Nenhuma regra de negócio aqui (ver
 * ChannelAdapter em ../types e restricao-de-canal.md).
 */
import { getEvolutionClient } from "@/lib/evolution/client";
import { evolutionSendPlanFor } from "@/lib/evolution/media-send";
import { parseEvolutionMessageId } from "@/lib/evolution/message-id";
import type { ChannelAdapter, OutboundEnvelope, RecipientInput } from "../types";

/** Só dígitos — a Evolution espera `number` cru, sem `@s.whatsapp.net`. */
function toDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const evolutionAdapter: ChannelAdapter = {
  provider: "evolution",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup) return input.groupChatId; // grupo: id cru, já no formato @g.us
    if (!input.phoneNumber) return null;
    const digits = toDigits(input.phoneNumber);
    return digits.length > 0 ? digits : null;
  },

  isConfigured(): boolean {
    return getEvolutionClient() !== null;
  },

  codes: {
    notConfigured: "evolution_not_configured",
    sendFailed: "evolution_error",
    unknownError: "evolution_unknown",
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    const client = getEvolutionClient();
    if (!client) return { externalId: null };

    const res = envelope.media
      ? await client.sendMedia(envelope.sessionRef, envelope.to, evolutionSendPlanFor(envelope.kind, envelope.media))
      : await client.sendText(envelope.sessionRef, envelope.to, envelope.body ?? "");

    return { externalId: parseEvolutionMessageId(res) };
  },
};
