import { ChatCircle } from "@/lib/ui/icons";

export default function AdminInboxIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <ChatCircle size={40} weight="duotone" className="opacity-40" aria-hidden />
      <p className="text-sm font-medium">Selecione uma conversa para visualizar</p>
      <p className="max-w-xs text-xs opacity-70">
        Modo somente-leitura. Use &ldquo;Impersonate&rdquo; para responder como atendente do tenant.
      </p>
    </div>
  );
}
