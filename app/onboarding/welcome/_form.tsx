"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Recife",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Bahia",
  "America/Rio_Branco",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/Madrid",
  "UTC",
];

export function WelcomeForm({ defaultOrgName }: { defaultOrgName: string }) {
  const [displayName, setDisplayName] = useState(defaultOrgName);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5 rounded-lg border bg-background p-6"
      action={(formData) => {
        if (!accepted) {
          toast.error("Aceite os termos para continuar.");
          return;
        }
        startTransition(async () => {
          const res = await acceptWelcome(formData);
          if (res && !res.ok) {
            toast.error(`Falha: ${res.error}`);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="display_name">Nome da operação</Label>
        <Input
          id="display_name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={120}
          required
        />
        <p className="text-xs text-muted-foreground">
          Como sua loja aparece para o time e nos painéis.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Fuso horário</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="timezone" value={timezone} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
          required
        />
        <span>
          Li e aceito os{" "}
          <a className="underline" href="/legal/terms" target="_blank" rel="noreferrer">
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a className="underline" href="/legal/privacy" target="_blank" rel="noreferrer">
            Política de Privacidade
          </a>
          .
        </span>
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !accepted}>
          {pending ? "Salvando..." : "Continuar"}
        </Button>
      </div>
    </form>
  );
}
