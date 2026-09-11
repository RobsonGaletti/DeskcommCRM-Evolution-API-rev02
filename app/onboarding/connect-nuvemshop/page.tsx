import { ConnectNuvemshopClient } from "./_client";

export const dynamic = "force-dynamic";

export default function ConnectNuvemshopPage() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Conectar Nuvemshop</h2>
        <p className="text-sm text-muted-foreground">
          Importe pedidos, clientes e produtos da sua loja Nuvemshop.
        </p>
      </header>
      <ConnectNuvemshopClient />
    </div>
  );
}
