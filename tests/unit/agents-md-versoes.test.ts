/**
 * Issue #66 — o `AGENTS.md` declara versões de biblioteca à mão, e à mão elas
 * desatualizam. Já aconteceu: o arquivo nasceu dizendo "Zod 3" num repo em
 * zod 4, numa seção rotulada CONFIRMADO. Um agente lendo aquilo escreveria
 * idioma da major errada.
 *
 * A régua respeita a PRECISÃO que o doc escolheu: se ele diz "Zod 4", basta a
 * major bater; se diz "Playwright 1.62", a minor entra na conta. Assim o teste
 * não vira ruído a cada bump de patch, e ainda assim pega o que enganaria
 * alguém — que foi exatamente um erro de minor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

/** Como o nome aparece no AGENTS.md → nome do pacote no package.json. */
const BIBLIOTECAS: Array<{ rotulo: string; pacote: string }> = [
  { rotulo: "Next\\.js", pacote: "next" },
  { rotulo: "React", pacote: "react" },
  { rotulo: "TypeScript", pacote: "typescript" },
  { rotulo: "Tailwind", pacote: "tailwindcss" },
  { rotulo: "Zod", pacote: "zod" },
  { rotulo: "Vitest", pacote: "vitest" },
  { rotulo: "Playwright", pacote: "@playwright/test" },
  { rotulo: "Sentry", pacote: "@sentry/nextjs" },
];

function versaoInstalada(pkg: Record<string, Record<string, string>>, nome: string): string {
  const bruto = pkg.dependencies?.[nome] ?? pkg.devDependencies?.[nome];
  if (!bruto) throw new Error(`${nome} não está no package.json`);
  return bruto.replace(/^[\^~>=<\s]+/, "");
}

describe("AGENTS.md × package.json", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
    string,
    Record<string, string>
  >;

  for (const { rotulo, pacote } of BIBLIOTECAS) {
    it(`declara a versão certa de ${pacote}`, () => {
      const achado = agents.match(new RegExp(`${rotulo}\\s+(\\d+(?:\\.\\d+)*)`));
      expect(achado, `AGENTS.md não declara a versão de ${pacote}`).toBeTruthy();

      const declarada = achado![1]!;
      const instalada = versaoInstalada(pkg, pacote);

      // Prefixo, não igualdade: "16.2" casa com "16.2.11", mas "1.61" não casa
      // com "1.62.0". A precisão de quem escreveu o doc é que manda.
      expect(
        instalada === declarada || instalada.startsWith(`${declarada}.`),
        `AGENTS.md diz ${pacote} ${declarada}, package.json tem ${instalada}`,
      ).toBe(true);
    });
  }
});
