import { describe, expect, it, vi, beforeEach } from "vitest";

const startSession = vi.fn();
const getSessionQr = vi.fn();

vi.mock("@/lib/waha/client", () => ({
  getWahaClient: () => ({ startSession, getSessionQr, stopSession: vi.fn() }),
}));

import { wahaLifecycleAdapter } from "@/lib/channels/adapters/waha-lifecycle";

describe("wahaLifecycleAdapter", () => {
  beforeEach(() => {
    startSession.mockReset();
    getSessionQr.mockReset();
  });

  it("ensureSession + startSession delegam ao WahaClient.startSession", async () => {
    startSession.mockResolvedValue({ status: "SCAN_QR_CODE", qr: "base64==" });
    await wahaLifecycleAdapter.ensureSession("org_abc");
    await wahaLifecycleAdapter.startSession("org_abc");
    expect(startSession).toHaveBeenCalledWith("org_abc");
  });

  it("getStatus normaliza a resposta do WAHA para SessionStatus", async () => {
    getSessionQr.mockResolvedValue({ status: "SCAN_QR_CODE", qr: "base64==", me: undefined });
    const status = await wahaLifecycleAdapter.getStatus("org_abc");
    expect(status).toEqual({ status: "SCAN_QR_CODE", qrImageBase64: "base64==", phoneNumber: null });
  });

  it("getStatus com status WORKING extrai o phoneNumber de me.id", async () => {
    getSessionQr.mockResolvedValue({ status: "WORKING", me: { id: "5531999998888@c.us" } });
    const status = await wahaLifecycleAdapter.getStatus("org_abc");
    expect(status).toEqual({ status: "WORKING", qrImageBase64: null, phoneNumber: "5531999998888" });
  });
});
