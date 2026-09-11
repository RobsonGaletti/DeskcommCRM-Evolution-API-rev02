import { SetupAiForm } from "./_form";

export const dynamic = "force-dynamic";

export default function SetupAiPage() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Configurar IA</h2>
        <p className="text-sm text-muted-foreground">
          Escolha um perfil para o seu primeiro Atendente IA. Você pode ajustar tudo depois.
        </p>
      </header>
      <SetupAiForm />
    </div>
  );
}
