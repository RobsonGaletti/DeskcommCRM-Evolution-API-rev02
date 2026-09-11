import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEvolutionMedia } from "@/lib/messaging/media/evolution-source";

describe("fetchEvolutionMedia", () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = OLD_ENV;
  });

  it("reconstrói a URL sobre EVOLUTION_API_BASE_URL, ignorando host anunciado", async () => {
    process.env = { ...OLD_ENV, EVOLUTION_API_BASE_URL: "http://evolution:8080", EVOLUTION_API_KEY: "k" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg", "content-length": "10" }),
      arrayBuffer: async () => new ArrayBuffer(10),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEvolutionMedia("http://attacker.example/media/abc.jpg?x=1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://evolution:8080/media/abc.jpg?x=1",
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "k" }) }),
    );
  });
});
