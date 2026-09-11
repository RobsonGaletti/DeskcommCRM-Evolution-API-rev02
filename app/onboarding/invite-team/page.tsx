import { isEmailConfigured } from "@/lib/email/resend";
import { InviteTeamForm } from "./_form";

export const dynamic = "force-dynamic";

export default function InviteTeamPage() {
  const emailReady = isEmailConfigured();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Convidar time</h2>
        <p className="text-sm text-muted-foreground">
          Cole até 20 emails (um por linha) e escolha a role compartilhada.
        </p>
      </header>
      {!emailReady ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Resend não configurado.</p>
          <p className="mt-1">
            Convites serão registrados localmente, mas o email não será enviado. Configure
            <code className="mx-1">RESEND_API_KEY</code> para envio real.
          </p>
        </div>
      ) : null}
      <InviteTeamForm />
    </div>
  );
}
