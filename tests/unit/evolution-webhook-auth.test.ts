import { describe, expect, it } from "vitest";
import { authenticateEvolutionWebhook } from "@/lib/evolution/webhook-auth";

describe("authenticateEvolutionWebhook", () => {
  it("header presente e igual ao secret da sessão: autentica", () => {
    const auth = authenticateEvolutionWebhook({ secretHeader: "abc123", sessionSecret: "abc123" });
    expect(auth).toEqual({ ok: true });
  });

  it("header presente e DIFERENTE do secret: rejeita (fail-closed)", () => {
    const auth = authenticateEvolutionWebhook({ secretHeader: "errado", sessionSecret: "abc123" });
    expect(auth).toEqual({ ok: false, reason: "bad_secret" });
  });

  it("sem header: rejeita sempre — a Evolution não assina corpo, então isto É a autenticação", () => {
    const auth = authenticateEvolutionWebhook({ secretHeader: null, sessionSecret: "abc123" });
    expect(auth).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("sem sessionSecret (decrypt falhou): rejeita, nunca aceita por omissão", () => {
    const auth = authenticateEvolutionWebhook({ secretHeader: "abc123", sessionSecret: null });
    expect(auth).toEqual({ ok: false, reason: "missing_secret" });
  });
});
