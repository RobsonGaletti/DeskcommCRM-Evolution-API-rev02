/**
 * MediaSource da Evolution: mesma mitigação de SSRF de `waha-source.ts` — a
 * URL anunciada no webhook NUNCA decide o host; só path+query sobrevivem,
 * resolvidos sobre EVOLUTION_API_BASE_URL.
 */
import { MAX_MEDIA_BYTES, MediaTooLargeError, type FetchedMedia } from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchEvolutionMedia(mediaUrl: string, hintMime?: string | null): Promise<FetchedMedia> {
  const base = process.env.EVOLUTION_API_BASE_URL;
  let url: URL;
  try {
    const advertised = new URL(mediaUrl);
    url = new URL(advertised.pathname + advertised.search, base ?? "");
  } catch {
    throw new Error("evolution_media_untrusted_host");
  }

  const apiKey = process.env.EVOLUTION_API_KEY;
  const res = await fetch(url.toString(), {
    headers: apiKey ? { apikey: apiKey } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`evolution_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const mime = res.headers.get("content-type") || hintMime || "application/octet-stream";
  return { buffer, mime };
}
