"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";

interface Recap {
  welcome: boolean;
  whatsapp: boolean;
  nuvemshop: boolean;
  ai: boolean;
  team: boolean;
}

const ITEMS: { key: keyof Recap; label: string }[] = [
  { key: "welcome", label: "Boas-vindas e termos" },
  { key: "whatsapp", label: "Canal WhatsApp" },
  { key: "nuvemshop", label: "Loja Nuvemshop" },
  { key: "ai", label: "Atendente IA" },
  { key: "team", label: "Convites de time" },
];

export function DoneClient({ recap }: { recap: Recap }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-6 rounded-lg border bg-background p-6 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">Tudo pronto!</h2>
      <p className="text-sm text-muted-foreground">
        Sua operação está configurada. Você pode ajustar tudo nas Configurações.
      </p>
      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm">
        {ITEMS.map((it) => {
          const done = recap[it.key];
          return (
            <li key={it.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  "inline-block h-2 w-2 rounded-full " +
                  (done ? "bg-emerald-500" : "bg-muted-foreground/30")
                }
              />
              <span className={done ? "" : "text-muted-foreground"}>
                {it.label} {done ? "" : "(pulado)"}
              </span>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await finishOnboarding();
            if (res && !res.ok) toast.error(`Falha: ${res.error}`);
          })
        }
      >
        {pending ? "Finalizando..." : "Ir para o Inbox"}
      </Button>
    </div>
  );
}
