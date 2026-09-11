"use client";

/**
 * Seletor WAHA/Evolution reusado no onboarding (`app/onboarding/connect-whatsapp/_client.tsx`)
 * e em Conexões (`ConnectionsClient.tsx`) — Task 7 do plano Evolution API
 * (2026-09-10). Nomes de produto de propósito: aqui o usuário está
 * literalmente escolhendo entre os dois provedores, então a cópia PRECISA
 * nomeá-los — diferente do invariante 1 da doutrina de restrição de canal
 * (que proíbe uma FEATURE decidir comportamento perguntando o nome do
 * provider). Ver a entrada em `scripts/lint-channels.ts` KNOWN_DEBT.
 */
import { Button } from "@/components/ui/button";

export type WhatsappProvider = "waha" | "evolution";

interface ProviderPickerProps {
  value: WhatsappProvider | null;
  onChange: (provider: WhatsappProvider) => void;
  wahaConfigured?: boolean;
  evolutionConfigured?: boolean;
  disabled?: boolean;
}

export function ProviderPicker({
  value,
  onChange,
  wahaConfigured = true,
  evolutionConfigured = true,
  disabled = false,
}: ProviderPickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Escolha o provedor de WhatsApp">
      <Button
        type="button"
        size="sm"
        variant={value === "waha" ? "default" : "outline"}
        disabled={disabled || !wahaConfigured}
        onClick={() => onChange("waha")}
      >
        WAHA
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "evolution" ? "default" : "outline"}
        disabled={disabled || !evolutionConfigured}
        onClick={() => onChange("evolution")}
      >
        Evolution API
      </Button>
    </div>
  );
}
