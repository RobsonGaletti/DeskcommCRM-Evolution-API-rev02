"use client";
import { Badge } from "@/components/ui/badge";
import type { SourceRow } from "@/hooks/ai/useKnowledgeSources";

type Variant = "default" | "neutral" | "success" | "warning" | "error" | "info";

export type DerivedBadgeStatus =
  | "ready"
  | "failed"
  | "partial"
  | "archived"
  | "not_indexed";

export function deriveBadgeStatus(
  source: Pick<SourceRow, "status" | "last_index_status" | "chunks_count">,
): DerivedBadgeStatus {
  if (source.status === "archived") return "archived";
  if (source.last_index_status === "failed") return "failed";
  if (source.last_index_status === "partial") return "partial";
  if (source.status === "failed") return "failed";
  if (source.status === "ready" && (source.chunks_count ?? 0) > 0) return "ready";
  return "not_indexed";
}

const MAP: Record<DerivedBadgeStatus, { label: string; variant: Variant }> = {
  ready: { label: "Pronto", variant: "success" },
  failed: { label: "Falhou", variant: "error" },
  partial: { label: "Parcial", variant: "warning" },
  archived: { label: "Arquivado", variant: "neutral" },
  not_indexed: { label: "Não indexado", variant: "neutral" },
};

interface Props {
  source: Pick<SourceRow, "status" | "last_index_status" | "chunks_count">;
}

export function SourceStatusBadge({ source }: Props) {
  const derived = deriveBadgeStatus(source);
  const { label, variant } = MAP[derived];
  return <Badge variant={variant}>{label}</Badge>;
}
