import { NextResponse } from "next/server";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";

/**
 * Proxy WAHA's QR endpoint so the browser can <img src="..." /> without
 * exposing the API key.
 *
 * WAHA Plus exposes: GET /api/{session}/auth/qr?format=image → image/png bytes.
 *
 * Evolution NUNCA chama esta rota: `SessionStatus.qrImageBase64` já vem
 * pronto no corpo de `/api/v1/onboarding/whatsapp/session` (Task 7 do plano
 * Evolution API), e o client renderiza `<img>` direto com esse valor — sem
 * proxy binário. `?provider=evolution` aqui é só uma trava defensiva (404
 * explícito) contra uma chamada acidental, não um caminho suportado; não há
 * endpoint da Evolution que devolva bytes crus de imagem pra proxyar.
 */
export async function GET(req: Request) {
  const user = await loadAuthUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return new NextResponse(null, { status: 404 });

  const provider = new URL(req.url).searchParams.get("provider");
  if (provider === "evolution") return new NextResponse(null, { status: 404 });

  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey || apiKey === "dev_plaintext_change_me") {
    return new NextResponse(null, { status: 503 });
  }

  const sessionName = `org_${activeOrg.orgId.slice(0, 8)}`;
  const upstream = await fetch(
    `${baseUrl}/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
    { headers: { "X-Api-Key": apiKey }, cache: "no-store" },
  );
  if (!upstream.ok) {
    return new NextResponse(null, {
      status: upstream.status,
      headers: { "x-waha-status": String(upstream.status) },
    });
  }

  const ct = upstream.headers.get("content-type") ?? "image/png";
  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": ct,
      "cache-control": "no-store, max-age=0",
    },
  });
}
