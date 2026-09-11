"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProviderPicker, type WhatsappProvider } from "@/components/connections/ProviderPicker";
import { skipWhatsapp, markWhatsappConfigured } from "@/app/actions/onboarding/skipWhatsapp";

interface Props {
  wahaConfigured: boolean;
  evolutionConfigured: boolean;
  sessionName: string;
}

type Status =
  | "INIT"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | "STOPPED"
  | "NOT_STARTED"
  | "ERROR";

interface SessionInfo {
  status: Status;
  session: string | null;
  channel_session_id?: string;
  /** Só presente/relevante pra Evolution — já em base64 pronto pro <img> (WAHA continua no proxy binário). */
  qr_image_base64?: string | null;
  error?: string;
}

/**
 * Server actions throw a sentinel `NEXT_REDIRECT` when calling `redirect()`.
 * The Next runtime catches it at the boundary, but inside a try/catch we
 * must re-throw so navigation actually happens.
 */
function isRedirectError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

export function ConnectWhatsappClient({ wahaConfigured, evolutionConfigured, sessionName }: Props) {
  const [pending, startTransition] = useTransition();
  // Só pede escolha quando há escolha de verdade (os dois configurados). Uma
  // instalação com um único provider ativo (o caso comum de self-host)
  // continua auto-iniciando exatamente como antes do seletor — não regride o
  // fluxo provado (J1.5 do e2e VPS-fresh: WAHA ativo → QR aparece sozinho,
  // sem clique nenhum).
  const [provider, setProvider] = useState<WhatsappProvider | null>(() => {
    if (wahaConfigured && evolutionConfigured) return null;
    if (wahaConfigured) return "waha";
    if (evolutionConfigured) return "evolution";
    return null;
  });
  const [info, setInfo] = useState<SessionInfo>({ status: "INIT", session: sessionName });
  const [qrTick, setQrTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const status = info.status;
  const configuredAtLeastOne = wahaConfigured || evolutionConfigured;

  // 1) On mount (quando o usuário já escolheu provider), inicia a sessão se
  // ainda não estiver rodando.
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/v1/onboarding/whatsapp/session?provider=${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const json = (await res.json()) as { data?: SessionInfo };
        if (!cancelled && json.data) setInfo(json.data);
      } catch (err) {
        if (!cancelled) setInfo({ status: "ERROR", session: sessionName, error: String(err) });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, sessionName]);

  // 2) Poll status every 3 seconds until WORKING/FAILED.
  useEffect(() => {
    if (!provider) return;
    if (status === "WORKING" || status === "FAILED") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/onboarding/whatsapp/session?provider=${provider}`);
        const json = (await res.json()) as { data?: SessionInfo };
        if (json.data) {
          setInfo(json.data);
          if (json.data.status === "SCAN_QR_CODE") setQrTick((t) => t + 1);
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
    return () => clearInterval(id);
  }, [provider, status]);

  // 3) When status → WORKING, auto-advance.
  useEffect(() => {
    if (status !== "WORKING") return;
    startTransition(async () => {
      try {
        await markWhatsappConfigured(sessionName, "WORKING");
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error("Falha ao avançar: " + String(err));
      }
    });
  }, [status, sessionName]);

  // Derruba a sessão morta e sobe outra. O polling volta sozinho porque `status`
  // sai de FAILED e o efeito que o observa roda de novo.
  async function restartSession() {
    if (!provider) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/onboarding/whatsapp/session?restart=1&provider=${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as { data?: SessionInfo };
      if (json.data) setInfo(json.data);
      else toast.error("Não consegui gerar outro código. Tente de novo em alguns segundos.");
    } catch {
      toast.error("Não consegui falar com o servidor. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const showQr = Boolean(provider) && status === "SCAN_QR_CODE";

  return (
    <div className="space-y-4 rounded-lg border bg-background p-6">
      {!configuredAtLeastOne && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Nenhum serviço de WhatsApp está configurado.</p>
          <p className="mt-1">
            Suba o Docker (<code>docker compose up -d waha</code>) ou configure a Evolution API e
            recarregue, ou pule este passo agora — você pode configurar WhatsApp depois em{" "}
            <strong>Configurações → Canais</strong>.
          </p>
        </div>
      )}

      {configuredAtLeastOne && !provider && (
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="text-sm font-medium">Escolha como conectar o WhatsApp:</p>
          <div className="mt-3">
            <ProviderPicker
              value={provider}
              onChange={setProvider}
              wahaConfigured={wahaConfigured}
              evolutionConfigured={evolutionConfigured}
            />
          </div>
        </div>
      )}

      {configuredAtLeastOne && provider && (
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="text-sm font-medium">
            Sessão: <code>{sessionName}</code>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: <code>{busy ? "STARTING…" : status}</code>
          </p>

          {showQr && (
            <div className="mt-4 flex flex-col items-center gap-3">
              {provider === "evolution" ? (
                info.qr_image_base64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={info.qr_image_base64}
                    alt="QR Code para conectar WhatsApp"
                    className="h-64 w-64 rounded-md border bg-white p-2"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Gerando QR Code…</p>
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={qrTick}
                  src={`/api/v1/onboarding/whatsapp/qr?t=${qrTick}`}
                  alt="QR Code para conectar WhatsApp"
                  className="h-64 w-64 rounded-md border bg-white p-2"
                />
              )}
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um
                aparelho → escaneie o código acima.
              </p>
            </div>
          )}

          {status === "STARTING" && (
            <p className="mt-3 text-xs text-muted-foreground">Aguardando gerar o QR Code…</p>
          )}

          {status === "WORKING" && (
            <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              ✓ Conectado! Avançando…
            </p>
          )}

          {status === "FAILED" && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-destructive">
                O código expirou antes de alguém escanear. É normal — ele vale só alguns minutos.
              </p>
              <p className="text-xs text-muted-foreground">
                Deixe o WhatsApp já aberto em <strong>Aparelhos conectados</strong> antes de gerar o
                próximo, que aí dá tempo de sobra.
              </p>
              <Button type="button" size="sm" disabled={busy} onClick={restartSession}>
                {busy ? "Gerando…" : "Gerar novo QR Code"}
              </Button>
            </div>
          )}

          {(status === "ERROR" || status === "NOT_STARTED") && (
            <p className="mt-3 text-xs text-muted-foreground">
              {info.error
                ? `Erro: ${info.error}`
                : "Sessão ainda não iniciada — clique em Já configurei pra recarregar."}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await skipWhatsapp();
              } catch (err) {
                if (isRedirectError(err)) throw err;
                toast.error("Falha ao pular: " + String(err));
              }
            })
          }
        >
          Pular por enquanto
        </Button>
        <Button
          type="button"
          disabled={pending || status === "WORKING"}
          onClick={() =>
            startTransition(async () => {
              try {
                await markWhatsappConfigured(
                  sessionName,
                  status === "WORKING" ? "WORKING" : "configured",
                );
              } catch (err) {
                if (isRedirectError(err)) throw err;
                toast.error("Falha ao marcar passo: " + String(err));
              }
            })
          }
        >
          Já configurei (continuar)
        </Button>
      </div>
    </div>
  );
}
