/** Extrai o id externo de uma resposta de envio da Evolution: sempre `{ key: { id } }`. */
export function parseEvolutionMessageId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { key?: { id?: unknown } };
  if (typeof r.key === "object" && r.key !== null && typeof r.key.id === "string") return r.key.id;
  return null;
}
