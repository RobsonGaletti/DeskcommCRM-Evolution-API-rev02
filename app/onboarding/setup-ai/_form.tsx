"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDefaultAgent, skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import type { PromptTemplate } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";

const TEMPLATES: { id: PromptTemplate; title: string; desc: string }[] = [
  {
    id: "ecommerce_friendly",
    title: "Amigável (e-commerce)",
    desc: "Tom caloroso e próximo. Bom para lojas com público B2C.",
  },
  {
    id: "ecommerce_professional",
    title: "Profissional",
    desc: "Tom formal e objetivo. Foco em pedidos e próximos passos.",
  },
  {
    id: "support_minimal",
    title: "Suporte minimalista",
    desc: "Frases curtas, direto ao ponto, escalonamento rápido.",
  },
];

export function SetupAiForm() {
  const [name, setName] = useState("Atendente IA");
  const [template, setTemplate] = useState<PromptTemplate>("ecommerce_friendly");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5 rounded-lg border bg-background p-6"
      action={(formData) => {
        startTransition(async () => {
          const res = await createDefaultAgent(formData);
          if (res && !res.ok) {
            toast.error(`Falha ao criar agente: ${res.error}`);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Nome do agente</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={80}
          required
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Estilo de prompt</legend>
        <div className="grid gap-2">
          {TEMPLATES.map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                template === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="prompt_template"
                value={t.id}
                checked={template === t.id}
                onChange={() => setTemplate(t.id)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => void skipAi())}
        >
          Pular
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar e continuar"}
        </Button>
      </div>
    </form>
  );
}
