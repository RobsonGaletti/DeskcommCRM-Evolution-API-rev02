/**
 * Core handlers para /api/v1/pipelines.
 *
 * Não há Route Handler REST para list pipelines no MVP — pipelines são
 * carregados em Server Components via cookie session. Este handler existe
 * para o MCP server (S-13.04) ler pipelines como uma tool de leitura.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";

type SB = SupabaseClient;

export interface ListPipelinesQuery {
  include_archived?: boolean;
}

export interface PipelineRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  is_archived: boolean;
  position: number;
  vocabulary: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function listPipelinesHandler(
  supabase: SB,
  ctx: HandlerCtx,
  q: ListPipelinesQuery = {},
): Promise<{ pipelines: PipelineRow[] }> {
  let query = supabase
    .from("crm_pipelines")
    .select(
      "id, organization_id, name, slug, description, is_default, is_archived, position, vocabulary, settings, created_at, updated_at",
    )
    .order("position", { ascending: true });

  if (!q.include_archived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  }
  return { pipelines: (data ?? []) as PipelineRow[] };
}
