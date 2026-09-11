"use client";
import { cn } from "@/lib/utils";
import {
  useChannelSessions,
  deriveOverallHealth,
  type ConnectionHealth,
} from "@/hooks/channels/useChannelSessions";

const DOT_COLOR: Record<ConnectionHealth, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  down: "bg-error",
  none: "bg-muted-foreground/40",
};

const DOT_LABEL: Record<ConnectionHealth, string> = {
  connected: "Todas as conexões ativas",
  connecting: "Conectando…",
  down: "Uma conexão caiu",
  none: "Nenhuma conexão",
};

/**
 * Bolinha de saúde exibida ao lado do item "Conexões" na sidebar. Poll leve
 * (30s) para o usuário ver de relance quando um número cai — sem precisar abrir nada.
 */
export function ConnectionHealthDot({ className }: { className?: string }) {
  const { data } = useChannelSessions({ refetchInterval: 30_000 });
  const health = deriveOverallHealth(data);
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        DOT_COLOR[health],
        health === "down" && "animate-pulse",
        className,
      )}
      title={DOT_LABEL[health]}
      aria-label={DOT_LABEL[health]}
    />
  );
}
