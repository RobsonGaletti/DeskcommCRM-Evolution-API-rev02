/**
 * Tradução leiga (pt-br) dos vetos da cadeia before_send (Operação Visível F2-i).
 * Os códigos são contrato do engine (lib/agent-engine/guardrails/before-send.ts +
 * pacing/spinning/promise/disclosure) — a tela mostra POR QUE uma resposta do
 * assistente foi retida, sem jargão. Módulo puro: testável sem DOM.
 */

/** Contexto dos knobs efetivos do número — interpola janela/horário na copy. */
export interface RetentionContext {
  window_start_hour: number;
  window_end_hour: number;
  allow_sunday: boolean;
  timezone: string;
}

export type RetentionKind = "protection" | "compliance" | "quality";

export interface RetentionCopy {
  kind: RetentionKind;
  title: string;
  description: string;
}

const TITLES: Record<RetentionKind, string> = {
  protection: "Resposta segurada pela proteção do número",
  compliance: "Resposta bloqueada por conformidade",
  quality: "Resposta retida para correção",
};

/**
 * Copy por código de veto. Códigos de proteção (pacing/spinning) tranquilizam:
 * foi proteção anti-bloqueio, não erro. Conformidade (stop/LGPD) é definitivo.
 * Qualidade (promise/disclosure) explica que o assistente corrige sozinho.
 */
export function retentionCopy(code: string | null, ctx: RetentionContext): RetentionCopy {
  const janela = `${ctx.window_start_hour}h–${ctx.window_end_hour}h${ctx.allow_sunday ? "" : ", sem domingo"}`;
  const make = (kind: RetentionKind, description: string): RetentionCopy => ({
    kind,
    title: TITLES[kind],
    description,
  });

  switch (code) {
    case "outside_window":
      return make(
        "protection",
        `Fora da janela de envio (${janela}). A resposta fica agendada para a próxima abertura da janela, às ${ctx.window_start_hour}h — isso protege o número contra bloqueio do WhatsApp.`,
      );
    case "warmup_cap":
      return make(
        "protection",
        `Este número ainda está em aquecimento e o limite diário de envios dele foi atingido. Enviar além disso arriscaria bloqueio pelo WhatsApp — libera de novo amanhã, a partir das ${ctx.window_start_hour}h.`,
      );
    case "daily_cap":
      return make(
        "protection",
        `O limite diário de envios do número foi atingido — proteção contra bloqueio do WhatsApp. Libera de novo amanhã, a partir das ${ctx.window_start_hour}h.`,
      );
    case "mass_identical":
      return make(
        "protection",
        "A mesma mensagem estava se repetindo em massa por este número. O envio foi segurado para variar o texto e não parecer robô para o WhatsApp.",
      );
    case "contato_bloqueado":
      return make(
        "compliance",
        "O contato pediu para não receber mensagens (opt-out). Nada será enviado a ele.",
      );
    case "lgpd_anonymized":
      return make(
        "compliance",
        "Este contato foi anonimizado (LGPD) — é proibido enviar qualquer mensagem a ele.",
      );
    case "lgpd_missing_legal_basis":
      return make(
        "compliance",
        "Não há base legal (LGPD) para o primeiro contato de prospecção com este lead. O time precisa regularizar o cadastro antes de abordar.",
      );
    case "promise_out_of_table":
      return make(
        "quality",
        "A resposta prometia um preço ou condição fora da tabela aprovada. O assistente foi orientado a corrigir antes de enviar.",
      );
    case "promise_semantic":
      return make(
        "quality",
        "A resposta continha uma promessa não autorizada. O assistente foi orientado a reescrever antes de enviar.",
      );
    case "disclosure_required":
      return make(
        "quality",
        "A primeira mensagem a um contato novo precisa se apresentar como assistente virtual. O assistente foi orientado a corrigir antes de enviar.",
      );
    default:
      return make(
        "protection",
        `Uma trava de segurança segurou esta resposta${code ? ` (código ${code})` : ""}. Ela não foi enviada ao contato.`,
      );
  }
}
