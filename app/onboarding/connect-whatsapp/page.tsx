import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { getWahaClient } from "@/lib/waha/client";
import { getEvolutionClient } from "@/lib/evolution/client";
import { ConnectWhatsappClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ConnectWhatsappPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const wahaConfigured = getWahaClient() !== null;
  const evolutionConfigured = getEvolutionClient() !== null;
  // We don't try to start the session at SSR — client kicks off the call
  // (and shows graceful banner if the chosen provider is not reachable).

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Conectar WhatsApp</h2>
        <p className="text-sm text-muted-foreground">
          Escaneie o QR Code com o WhatsApp Business para conectar seu número à plataforma.
        </p>
      </header>
      <ConnectWhatsappClient
        wahaConfigured={wahaConfigured}
        evolutionConfigured={evolutionConfigured}
        sessionName={`org_${activeOrg.orgId.slice(0, 8)}`}
      />
    </div>
  );
}
