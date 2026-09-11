"use client";

import { startTransition } from "react";
import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";

export function SkipToEnd() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-xs text-muted-foreground"
      onClick={() => {
        startTransition(() => {
          void finishOnboarding();
        });
      }}
    >
      Pular tudo (DEV)
    </Button>
  );
}
