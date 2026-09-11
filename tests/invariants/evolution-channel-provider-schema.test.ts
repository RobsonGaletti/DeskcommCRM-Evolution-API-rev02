import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * O que a migration 0098 promete: `evolution` é um 3º ramo válido da união
 * `channel_sessions.provider`, cobrado no banco que o clone recebe.
 *
 * Arquivo NOVO de propósito — `tests/invariants/channel-provider-schema.test.ts`
 * (0087) é congelado pela governança do repo (ver seu próprio README:
 * "Invariantes existentes são congelados: adicione, não edite/delete").
 */

function novaOrg(slug: string): string {
  sql(`
    insert into public.organizations (slug, legal_name, display_name)
    values ('${slug}', 'inv 0098', 'inv 0098');
  `);
  return sql(`select id from public.organizations where slug = '${slug}'`).trim();
}

function insertSession(org: string, cols: Record<string, string>): string {
  const nomes = ["organization_id", "webhook_secret_encrypted", ...Object.keys(cols)];
  const vals = [`'${org}'`, `'\\x00'::bytea`, ...Object.values(cols)];
  return sql(`
    insert into public.channel_sessions (${nomes.join(", ")})
    values (${vals.join(", ")});
    select 'ok';
  `);
}

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o INSERT passou — a trava não existe neste banco");
}

describe("0098 · evolution é um provider de verdade no banco", () => {
  it("as duas colunas evolution existem", () => {
    const cols = sql(`select column_name from information_schema.columns
                       where table_schema = 'public' and table_name = 'channel_sessions'
                         and column_name like 'evolution\\_%' order by 1`).split("\n");
    expect(cols).toEqual(["evolution_instance_name", "evolution_token_encrypted"]);
  });

  it("sessão evolution sem evolution_instance_name é RECUSADA", () => {
    const org = novaOrg(`inv-0098-a-${Date.now()}`);
    const msg = erroDe(() =>
      insertSession(org, { provider: `'evolution'`, waha_session_name: "null" }),
    );
    expect(msg).toMatch(/channel_sessions_provider_ref_check/);
  });

  it("sessão evolution com evolution_instance_name é ACEITA", () => {
    const org = novaOrg(`inv-0098-b-${Date.now()}`);
    expect(() =>
      insertSession(org, {
        provider: `'evolution'`,
        waha_session_name: "null",
        evolution_instance_name: `'org-b-inst'`,
      }),
    ).not.toThrow();
  });

  it("provider 'evolution' continua batendo com o vocabulário do CHECK", () => {
    // Complementa (sem duplicar) o teste congelado da 0087, que já compara
    // channel_sessions_provider_check com lib/channels/types.ts inteiro.
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint
                      where conrelid = 'public.channel_sessions'::regclass
                        and conname = 'channel_sessions_provider_check'`);
    expect(def).toMatch(/'evolution'::text/);
  });
});
