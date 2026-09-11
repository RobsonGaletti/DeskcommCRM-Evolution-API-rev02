import { describe, expect, it, vi, beforeEach } from "vitest";

const { encryptWebhookSecret } = vi.hoisted(() => ({ encryptWebhookSecret: vi.fn() }));

vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com.br" } }));

import { provisionWebhookSecret } from "@/lib/channels/webhook-provisioning";

describe("provisionWebhookSecret", () => {
  beforeEach(() => {
    encryptWebhookSecret.mockReset();
  });

  it("waha: needed=false, não chama encryptWebhookSecret", async () => {
    const result = await provisionWebhookSecret({} as never, "waha", "tok123");
    expect(result).toEqual({ needed: false });
    expect(encryptWebhookSecret).not.toHaveBeenCalled();
  });

  it("meta_cloud: needed=false", async () => {
    const result = await provisionWebhookSecret({} as never, "meta_cloud", "tok123");
    expect(result).toEqual({ needed: false });
  });

  it("evolution: needed=true, ok=true com secret cifrado e URL montada a partir de NEXT_PUBLIC_APP_URL", async () => {
    encryptWebhookSecret.mockResolvedValue("\\xdeadbeef");
    const result = await provisionWebhookSecret({} as never, "evolution", "tok123");
    expect(result.needed).toBe(true);
    if (!result.needed) throw new Error("unreachable");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.secretEncrypted).toBe("\\xdeadbeef");
    expect(result.webhook.url).toBe("https://crm.exemplo.com.br/api/v1/webhooks/evolution/tok123");
    expect(result.webhook.secret).toEqual(expect.any(String));
    expect(result.webhook.secret.length).toBeGreaterThanOrEqual(32); // hex de 32 bytes = 64 chars
  });

  it("evolution: needed=true, ok=false quando a cifra está indisponível (GUC ausente)", async () => {
    encryptWebhookSecret.mockResolvedValue(null);
    const result = await provisionWebhookSecret({} as never, "evolution", "tok123");
    expect(result).toEqual({ needed: true, ok: false });
  });
});
