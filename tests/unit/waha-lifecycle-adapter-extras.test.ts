/**
 * Casos de `isConfigured`/`stopSession` do `wahaLifecycleAdapter`, adicionados
 * pelo adendo da Task 3 que estende `SessionLifecycleAdapter`. Em arquivo
 * separado de `waha-lifecycle-adapter.test.ts` (Task 2, já revisado) de
 * propósito — evita reabrir um arquivo de outra task já fechada.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const stopSession = vi.fn();

let wahaClientConfigured = true;

vi.mock("@/lib/waha/client", () => ({
  getWahaClient: () =>
    wahaClientConfigured ? { startSession: vi.fn(), getSessionQr: vi.fn(), stopSession } : null,
}));

import { wahaLifecycleAdapter } from "@/lib/channels/adapters/waha-lifecycle";

describe("wahaLifecycleAdapter — isConfigured/stopSession", () => {
  beforeEach(() => {
    stopSession.mockReset();
    wahaClientConfigured = true;
  });

  it("isConfigured reflete getWahaClient() !== null", () => {
    wahaClientConfigured = true;
    expect(wahaLifecycleAdapter.isConfigured()).toBe(true);

    wahaClientConfigured = false;
    expect(wahaLifecycleAdapter.isConfigured()).toBe(false);
  });

  it("stopSession delega a WahaClient.stopSession (idempotente: trata 404/422/409 dentro do client)", async () => {
    stopSession.mockResolvedValue(undefined);
    await wahaLifecycleAdapter.stopSession("org_abc");
    expect(stopSession).toHaveBeenCalledWith("org_abc");
  });

  it("stopSession lança quando o WAHA não está configurado", async () => {
    wahaClientConfigured = false;
    await expect(wahaLifecycleAdapter.stopSession("org_abc")).rejects.toThrow("waha_not_configured");
  });
});
