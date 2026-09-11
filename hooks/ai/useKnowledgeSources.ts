"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface SourceRow {
  id: string;
  agent_id: string;
  organization_id: string;
  source_type: string;
  name?: string | null;
  status: "ready" | "archived" | "failed" | string | null;
  last_index_status: "failed" | "partial" | null;
  last_index_error: string | null;
  last_indexed_at: string | null;
  chunks_count: number;
  is_active: boolean;
  source_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  data: SourceRow[];
}

interface ReindexResponse {
  data: { id: string; queued: true; agent_id: string };
}

export const sourcesQueryKey = (agentId: string) =>
  ["ai", "knowledge", "sources", agentId] as const;

export function useKnowledgeSources(
  agentId: string,
  opts?: { initialData?: SourceRow[] },
) {
  return useQuery({
    queryKey: sourcesQueryKey(agentId),
    queryFn: async () => {
      try {
        const res = await apiClient.get<ListResponse>("/api/v1/ai/knowledge/sources");
        return (res.data ?? []).filter((s) => s.agent_id === agentId);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    initialData: opts?.initialData,
    enabled: !!agentId,
  });
}

export function useReindexSource(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["ai", "knowledge", "sources", agentId, "reindex"],
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ReindexResponse>(
        `/api/v1/ai/knowledge/sources/${id}/reindex`,
        {},
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success("Reindexação enfileirada — atualizando em segundo plano.");
    },
    onError: (err) => {
      showApiError(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: sourcesQueryKey(agentId) });
    },
  });
}
