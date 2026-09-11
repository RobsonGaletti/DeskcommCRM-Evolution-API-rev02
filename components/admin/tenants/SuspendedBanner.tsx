"use client";
import { Warning } from "@/lib/ui/icons";

interface SuspendedBannerProps {
  suspendedAt: string;
  reason?: string;
}

function formatRelativePtBr(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  if (diffDays < 30) return `há ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) > 1 ? "s" : ""}`;
  if (diffDays < 365) return `há ${Math.floor(diffDays / 30)} mês${Math.floor(diffDays / 30) > 1 ? "es" : ""}`;
  return `há ${Math.floor(diffDays / 365)} ano${Math.floor(diffDays / 365) > 1 ? "s" : ""}`;
}

export function SuspendedBanner({ suspendedAt, reason }: SuspendedBannerProps) {
  return (
    <div
      role="region"
      aria-label="Tenant Suspenso"
      className="sticky top-0 z-10 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-sm">
        <span className="font-semibold">Tenant suspenso</span>{" "}
        {formatRelativePtBr(suspendedAt)}.{" "}
        <span className="text-amber-800 dark:text-amber-300">
          {reason ?? "Sem razão registrada."}
        </span>
      </p>
    </div>
  );
}
