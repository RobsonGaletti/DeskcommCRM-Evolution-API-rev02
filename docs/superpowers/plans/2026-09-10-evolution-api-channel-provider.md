# Evolution API como terceiro ChannelProvider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar Evolution API como um segundo provider self-host de WhatsApp (ao lado do WAHA, que continua intocado no comportamento), escolhido por organização.

**Architecture:** Evolution vira o terceiro valor de `ChannelProvider` (`"waha" | "meta_cloud" | "evolution"`) no seam já existente `lib/channels/`. Uma abstração nova, `SessionLifecycleAdapter`, generaliza criação/status/QR de sessão (hoje só existe para WAHA, hardcoded) — WAHA migra para ela junto, Evolution nasce nela. Credencial da instância Evolution vive cifrada em `channel_sessions` (mesmo mecanismo `fn_encrypt_oauth`/`fn_decrypt_oauth` que `meta_cloud` já usa). Webhook entra por rota nova, mesmo padrão de token por sessão do WAHA, mas autenticado por header-secreto (Evolution não assina HMAC de corpo).

**Tech Stack:** Next.js 16 Route Handlers, Supabase (Postgres + RLS), Vitest (`test:unit` + `test:db`), Evolution API v2 (self-hosted, imagem `evoapicloud/evolution-api`, engine Baileys).

**Spec:** `docs/superpowers/specs/2026-09-10-evolution-api-channel-provider-design.md`

## Global Constraints

- Nenhuma feature fora de `lib/channels/` e `lib/evolution/` nomeia o provider (`scripts/lint-channels.ts` reprova) — pergunte `capabilitiesOf`, `getAdapter`, `resolveSessionRef`.
- Toda mudança de schema sai como migration versionada (`supabase/migrations/`) **+** apêndice idempotente em `supabase/baseline.sql` **+** linha no `MANIFEST.md` (doutrina do repo).
- `tests/invariants/**` é congelado: **arquivo novo, nunca edição** de um teste existente.
- Credencial da Evolution fica cifrada por sessão em `channel_sessions` — nunca em texto plano, nunca só em env global (doutrina `restricao-de-canal.md`).
- Capabilities da Evolution são **idênticas** às do WAHA (mesma engine Baileys, mesmo risco de banimento) — copiar o objeto, não reinventar.
- Sem git neste diretório de trabalho (confirmado no brainstorming): cada task termina com um passo de commit `git commit` **condicional** — só rode se `git rev-parse --show-toplevel` funcionar; senão, pule e siga.

---

## Task 1: Schema — coluna `evolution_*` em `channel_sessions`

**Files:**
- Create: `supabase/migrations/20260910120000_0098_evolution_channel_provider.sql`
- Modify: `supabase/baseline.sql` (apêndice, ao final do arquivo — após o bloco `-- ---- meta templates (migration 0088) ----` ou ao final de todo o arquivo, o que vier depois)
- Modify: `supabase/migrations/MANIFEST.md` (nova linha na tabela "Applied")
- Create: `tests/invariants/evolution-channel-provider-schema.test.ts`

**Interfaces:**
- Produces: colunas `channel_sessions.evolution_instance_name text`, `channel_sessions.evolution_token_encrypted bytea`; constraint `channel_sessions_provider_check` agora aceita `'evolution'`; constraint `channel_sessions_provider_ref_check` agora tem o 3º ramo. Tasks seguintes (`lib/channels/types.ts`) dependem desses nomes exatos de coluna.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0098 — Evolution API: terceiro ramo da união `provider` em channel_sessions.
--
-- Mesma tagged union da 0087 (WAHA/meta_cloud), agora com um 3º ramo. As DUAS
-- constraints existentes (`channel_sessions_provider_check`,
-- `channel_sessions_provider_ref_check`) precisam ser DROPADAS e recriadas com
-- a definição nova — um `do $$ ... exception when duplicate_object` (como a
-- 0087 fez) não serviria aqui: o nome já existe (criado pela 0087), a exceção
-- dispararia e a definição VELHA (2 ramos) ficaria — o `evolution` continuaria
-- sendo recusado num clone que já rodou o baseline uma vez.
--
-- Backfill: nenhum. A migration só ACRESCENTA um ramo à união — toda linha
-- existente já satisfaz `provider IN ('waha','meta_cloud')`, que continua
-- válido depois do ALTER.

alter table public.channel_sessions
  add column if not exists evolution_instance_name text,
  add column if not exists evolution_token_encrypted bytea;

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'evolution'::text]));

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (
  (provider = 'waha'       and waha_session_name       is not null) or
  (provider = 'meta_cloud' and meta_phone_number_id    is not null) or
  (provider = 'evolution'  and evolution_instance_name is not null)
);

comment on column public.channel_sessions.provider is
  'Canal desta sessão. Vocabulário espelhado em lib/channels/types.ts → ChannelProvider (cobrado por tests/invariants/vocabulario-banco-x-typescript.test.ts e evolution-channel-provider-schema.test.ts).';
```

- [ ] **Step 2: Aplicar a migration no banco de dev via MCP Supabase (`apply_migration`) ou `supabase db push`**

Confira antes/depois: `select column_name from information_schema.columns where table_name='channel_sessions' and column_name like 'evolution%'` deve trazer as 2 colunas novas.

- [ ] **Step 3: Acrescentar o apêndice ao final de `supabase/baseline.sql`**

Copie o corpo SQL do Step 1 (sem o comentário de cabeçalho, que já vive na migration) para o final de `supabase/baseline.sql`, com o rótulo padrão do arquivo:

```sql
-- ---- evolution channel provider (migration 0098) ----
-- Espelho idempotente da migration 0098. Racional completo no arquivo da
-- migration; aqui fica o que o install.sh/update.sh precisa executar.

alter table public.channel_sessions
  add column if not exists evolution_instance_name text,
  add column if not exists evolution_token_encrypted bytea;

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'evolution'::text]));

alter table public.channel_sessions drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (
  (provider = 'waha'       and waha_session_name       is not null) or
  (provider = 'meta_cloud' and meta_phone_number_id    is not null) or
  (provider = 'evolution'  and evolution_instance_name is not null)
);

comment on column public.channel_sessions.provider is
  'Canal desta sessão. Vocabulário espelhado em lib/channels/types.ts → ChannelProvider (cobrado por tests/invariants/vocabulario-banco-x-typescript.test.ts e evolution-channel-provider-schema.test.ts).';
```

- [ ] **Step 4: Regenerar `lib/database.types.ts`**

Rode o gerador de tipos do Supabase (`supabase gen types typescript` apontando pro projeto/local) e confira que `channel_sessions` no arquivo gerado ganhou `evolution_instance_name` e `evolution_token_encrypted`.

- [ ] **Step 5: Escrever `tests/invariants/evolution-channel-provider-schema.test.ts` (arquivo NOVO — não editar o 0087)**

```typescript
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
```

- [ ] **Step 6: Rodar `pnpm test:db` e confirmar que os dois arquivos de invariante (0087 congelado + 0098 novo) passam**

Run: `pnpm test:db`
Expected: PASS em ambos, incluindo o teste congelado `channel-provider-schema.test.ts` (que agora lê `'evolution'` no CHECK e ainda precisa achar `'evolution'` em `ChannelProvider` — isso só vai ficar verde depois da Task 2; rode de novo ao final da Task 2 se falhar aqui).

- [ ] **Step 7: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add supabase/migrations/20260910120000_0098_evolution_channel_provider.sql supabase/baseline.sql supabase/migrations/MANIFEST.md lib/database.types.ts tests/invariants/evolution-channel-provider-schema.test.ts && git commit -m "feat(schema): evolution como 3o ramo de channel_sessions.provider"
```

---

## Task 2: `SessionLifecycleAdapter` — abstração nova, WAHA migra para ela (sem mudar comportamento)

**Files:**
- Create: `lib/channels/session-lifecycle.ts`
- Create: `lib/channels/adapters/waha-lifecycle.ts`
- Modify: `lib/channels/types.ts` (adiciona `"evolution"` a `ChannelProvider`)
- Modify: `app/api/v1/onboarding/whatsapp/session/route.ts` (passa a usar `getSessionLifecycleAdapter("waha")` em vez de `getWahaClient()` direto)
- Test: `tests/unit/waha-lifecycle-adapter.test.ts`

**Interfaces:**
- Consumes: `WahaClient` de `lib/waha/client.ts` (`startSession`, `stopSession`, `getSessionQr` — assinaturas já existentes, ver Task de leitura).
- Produces: `SessionStatus`, `SessionLifecycleAdapter`, `getSessionLifecycleAdapter(provider: ChannelProvider): SessionLifecycleAdapter` — a Task 3 (Evolution) implementa esta mesma interface.

- [ ] **Step 1: Adicionar `"evolution"` ao union type**

`lib/channels/types.ts:11`:

```typescript
export type ChannelProvider = "waha" | "meta_cloud" | "evolution";
```

- [ ] **Step 2: Escrever o teste do adapter de ciclo de vida do WAHA**

```typescript
// tests/unit/waha-lifecycle-adapter.test.ts
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm vitest run tests/unit/waha-lifecycle-adapter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/channels/adapters/waha-lifecycle'`

- [ ] **Step 4: Escrever a interface**

```typescript
// lib/channels/session-lifecycle.ts
/**
 * Ciclo de vida de UMA sessão de canal — criar, iniciar, checar status/QR.
 *
 * Distinto de `ChannelAdapter` (types.ts): aquele é sobre ENVIAR mensagem numa
 * sessão já conectada; este é sobre CONECTAR a sessão em si. Até aqui só
 * existia pro WAHA, hardcoded em `app/api/v1/onboarding/whatsapp/session/route.ts`
 * — sem esta interface, Evolution vira um segundo caminho de código na tela em
 * vez de um segundo provider de verdade (doutrina restricao-de-canal.md,
 * invariante 1: nenhuma feature nomeia provider).
 */
import type { ChannelProvider } from "./types";

export interface SessionStatus {
  status: "STARTING" | "SCAN_QR_CODE" | "WORKING" | "STOPPED" | "FAILED";
  /** Presente só quando status === 'SCAN_QR_CODE'. Já em base64 pronto pro <img>. */
  qrImageBase64: string | null;
  /** Só dígitos, sem sufixo de domínio. null enquanto não há sessão conectada. */
  phoneNumber: string | null;
}

export interface SessionLifecycleAdapter {
  readonly provider: ChannelProvider;
  /** Idempotente: cria a instância/sessão no provider se ainda não existir. */
  ensureSession(sessionRef: string): Promise<void>;
  /** Inicia a conexão (dispara geração de QR do lado do provider). Idempotente. */
  startSession(sessionRef: string): Promise<void>;
  getStatus(sessionRef: string): Promise<SessionStatus>;
}
```

- [ ] **Step 5: Escrever o adapter WAHA (delega ao `WahaClient` existente, comportamento idêntico ao de hoje)**

```typescript
// lib/channels/adapters/waha-lifecycle.ts
import { getWahaClient } from "@/lib/waha/client";
import type { SessionLifecycleAdapter, SessionStatus } from "../session-lifecycle";

interface WahaSessionResponse {
  status?: string;
  qr?: string;
  me?: { id?: string };
}

function toSessionStatus(raw: WahaSessionResponse): SessionStatus {
  const status = (raw.status as SessionStatus["status"]) ?? "STARTING";
  return {
    status,
    qrImageBase64: status === "SCAN_QR_CODE" ? (raw.qr ?? null) : null,
    phoneNumber: raw.me?.id ? raw.me.id.replace(/@.*$/, "") : null,
  };
}

export const wahaLifecycleAdapter: SessionLifecycleAdapter = {
  provider: "waha",

  async ensureSession(sessionRef: string): Promise<void> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    await client.startSession(sessionRef);
  },

  async startSession(sessionRef: string): Promise<void> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    await client.startSession(sessionRef);
  },

  async getStatus(sessionRef: string): Promise<SessionStatus> {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    const raw = (await client.getSessionQr(sessionRef)) as WahaSessionResponse;
    return toSessionStatus(raw);
  },
};
```

- [ ] **Step 6: Rodar de novo e ver passar**

Run: `pnpm vitest run tests/unit/waha-lifecycle-adapter.test.ts`
Expected: PASS

- [ ] **Step 7: Criar o factory e exportar do seam**

Adicione a `lib/channels/index.ts`:

```typescript
import { wahaLifecycleAdapter } from "./adapters/waha-lifecycle";
import type { SessionLifecycleAdapter } from "./session-lifecycle";

const LIFECYCLE_ADAPTERS: Record<ChannelProvider, SessionLifecycleAdapter | null> = {
  waha: wahaLifecycleAdapter,
  meta_cloud: null, // Cloud API não tem "conectar sessão" — número já é da Meta.
  evolution: null, // Task 3 preenche.
};

export function getSessionLifecycleAdapter(provider: ChannelProvider): SessionLifecycleAdapter {
  const adapter = LIFECYCLE_ADAPTERS[provider];
  if (!adapter) throw new Error(`no_session_lifecycle_for_provider: ${provider}`);
  return adapter;
}

export type { SessionLifecycleAdapter, SessionStatus } from "./session-lifecycle";
```

- [ ] **Step 8: Rewire `app/api/v1/onboarding/whatsapp/session/route.ts` para usar o adapter (comportamento observável idêntico — mesmos status strings, mesmo shape de resposta)**

Troque `getWahaClient()` por `getSessionLifecycleAdapter("waha")` nos dois handlers (`GET`/`POST`); `waha.getSessionQr(sessionName)` vira `adapter.getStatus(sessionName)` e o retorno já é `SessionStatus` (troque `remote.status` por `remote.status` — mesmo nome de campo, então o `ok({ status: ..., session: sessionName })` da rota não muda). `waha.startSession(sessionName)` vira `adapter.startSession(sessionName)` seguido de `adapter.getStatus(sessionName)` (o adapter novo não devolve o qr no retorno de `startSession`, só em `getStatus` — chame os dois em sequência, como o código antigo já fazia via `getSessionQr` no branch 422).

- [ ] **Step 9: Testar manualmente que o onboarding WAHA continua idêntico**

Com `docker compose up -d waha` no ar, abra `/onboarding/connect-whatsapp`, confirme que o QR aparece e o status avança para `WORKING` ao escanear — mesmo fluxo de antes da Task.

- [ ] **Step 10: Rodar a suíte inteira de unit + o test:db da Task 1 (o teste congelado do vocabulário agora deve fechar)**

Run: `pnpm test:unit && pnpm test:db`
Expected: PASS — inclusive `tests/invariants/channel-provider-schema.test.ts` (0087), que compara o CHECK do banco com `ChannelProvider`, agora com os 3 valores dos dois lados.

- [ ] **Step 11: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add lib/channels/types.ts lib/channels/session-lifecycle.ts lib/channels/adapters/waha-lifecycle.ts lib/channels/index.ts app/api/v1/onboarding/whatsapp/session/route.ts tests/unit/waha-lifecycle-adapter.test.ts && git commit -m "refactor(channels): abstrai ciclo de vida de sessao, waha migra sem mudar comportamento"
```

---

## Task 3: `lib/evolution/client.ts` + adapter de ciclo de vida da Evolution

**Files:**
- Create: `lib/evolution/client.ts`
- Create: `lib/channels/adapters/evolution-lifecycle.ts`
- Modify: `lib/env.ts` (env vars novas)
- Modify: `.env.example` (documentação das vars novas)
- Modify: `lib/channels/index.ts` (registra `evolution` no `LIFECYCLE_ADAPTERS`)
- Test: `tests/unit/evolution-client.test.ts`, `tests/unit/evolution-lifecycle-adapter.test.ts`

**Interfaces:**
- Consumes: `SessionLifecycleAdapter`/`SessionStatus` (Task 2).
- Produces: `EvolutionClient` (`createInstance`, `connect`, `getConnectionState`, `sendText`, `sendMedia` — os dois últimos consumidos pela Task 4), `getEvolutionClient(): EvolutionClient | null`, `evolutionLifecycleAdapter: SessionLifecycleAdapter`.

- [ ] **Step 1: Env vars**

`lib/env.ts`, ao lado do bloco WAHA:

```typescript
// Evolution API (provider alternativo, grátis, mesma engine Baileys do WAHA)
EVOLUTION_API_BASE_URL: z.string().optional().default(""),
EVOLUTION_API_KEY: z.string().optional().default(""), // admin key — só cria/gerencia instâncias, nunca vai pro cliente
```

`.env.example`, novo bloco espelhando o do WAHA:

```
# --- Evolution API (opcional — provider alternativo ao WAHA) ------------------
# URL base do servidor Evolution API (ex: http://localhost:8080 em dev).
EVOLUTION_API_BASE_URL=
# API key ADMIN da instalação Evolution (cria/gerencia instâncias). NUNCA é a
# credencial de uma organização específica — essa fica cifrada por sessão.
EVOLUTION_API_KEY=
```

- [ ] **Step 2: Escrever o teste do client (mocka `fetch` global)**

```typescript
// tests/unit/evolution-client.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvolutionClient } from "@/lib/evolution/client";

describe("EvolutionClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("createInstance chama POST /instance/create com apikey e integration Baileys", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instance: { instanceName: "org-abc", status: "created" }, hash: "tok-123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const res = await client.createInstance("org-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/instance/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "admin-key" }),
        body: JSON.stringify({ instanceName: "org-abc", integration: "WHATSAPP-BAILEYS", qrcode: true }),
      }),
    );
    expect(res.instanceToken).toBe("tok-123");
  });

  it("createInstance trata 403 'already in use' como já existente (idempotente)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "already in use" }),
    );
    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    await expect(client.createInstance("org-abc")).resolves.toEqual({ instanceToken: null, alreadyExists: true });
  });

  it("connect chama GET /instance/connect/{name} e devolve o qrcode base64", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ base64: "data:image/png;base64,AAA=" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const qr = await client.connect("org-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/instance/connect/org-abc",
      expect.objectContaining({ headers: expect.objectContaining({ apikey: "admin-key" }) }),
    );
    expect(qr).toBe("data:image/png;base64,AAA=");
  });

  it("getConnectionState mapeia 'open'→WORKING, 'connecting'→SCAN_QR_CODE, 'close'→STOPPED", async () => {
    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    for (const [raw, expected] of [
      ["open", "WORKING"],
      ["connecting", "SCAN_QR_CODE"],
      ["close", "STOPPED"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ instance: { state: raw } }) }),
      );
      await expect(client.getConnectionState("org-abc")).resolves.toBe(expected);
    }
  });

  it("sendText chama POST /message/sendText/{name} com number e text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: "3EB0ABC" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EvolutionClient("http://localhost:8080", "admin-key");
    const res = await client.sendText("org-abc", "5531999998888", "oi");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/message/sendText/org-abc",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ number: "5531999998888", text: "oi" }),
      }),
    );
    expect(res).toEqual({ key: { id: "3EB0ABC" } });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm vitest run tests/unit/evolution-client.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `lib/evolution/client.ts`**

```typescript
/**
 * Client REST mínimo da Evolution API v2 — mesmo papel de `lib/waha/client.ts`
 * pro outro provider. Auth por header `apikey` (não `Authorization: Bearer`).
 *
 * `EVOLUTION_API_KEY` é a chave ADMIN da instalação (cria/gerencia instâncias);
 * o token de UMA organização (`instanceToken`, devolvido por `createInstance`
 * em `hash`) é o que vai cifrado em `channel_sessions.evolution_token_encrypted`
 * — mas não é usado pra autenticar chamadas de instância (a apikey admin já
 * basta em self-host de servidor único; ver spec §2, "um servidor por
 * instalação").
 */
export interface EvolutionCreateInstanceResult {
  instanceToken: string | null;
  alreadyExists?: boolean;
}

export type EvolutionConnectionState = "STARTING" | "SCAN_QR_CODE" | "WORKING" | "STOPPED" | "FAILED";

const STATE_MAP: Record<string, EvolutionConnectionState> = {
  open: "WORKING",
  connecting: "SCAN_QR_CODE",
  close: "STOPPED",
};

export class EvolutionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  /** Idempotente: 403 "already in use"/409 tratados como já existente. */
  async createInstance(instanceName: string): Promise<EvolutionCreateInstanceResult> {
    const res = await fetch(`${this.baseUrl}/instance/create`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 409) return { instanceToken: null, alreadyExists: true };
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_create_${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as { hash?: string };
    return { instanceToken: body.hash ?? null };
  }

  /** GET /instance/connect/{name} — devolve o QR já em base64 (com prefixo data:image). */
  async connect(instanceName: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: this.apiKey },
    });
    if (!res.ok) throw new Error(`evolution_connect_${res.status}`);
    const body = (await res.json()) as { base64?: string; qrcode?: { base64?: string } };
    const raw = body.base64 ?? body.qrcode?.base64 ?? null;
    if (!raw) return null;
    return raw.startsWith("data:image") ? raw : `data:image/png;base64,${raw}`;
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    const res = await fetch(
      `${this.baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { headers: { apikey: this.apiKey } },
    );
    if (!res.ok) throw new Error(`evolution_state_${res.status}`);
    const body = (await res.json()) as { instance?: { state?: string } };
    return STATE_MAP[body.instance?.state ?? ""] ?? "STARTING";
  }

  async sendText(instanceName: string, number: string, text: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_send_${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async sendMedia(
    instanceName: string,
    number: string,
    plan: { endpoint: string; payload: Record<string, unknown> },
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/message/${plan.endpoint}/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, ...plan.payload }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`evolution_send_${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
}

export function getEvolutionClient(): EvolutionClient | null {
  const url = process.env.EVOLUTION_API_BASE_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return null;
  return new EvolutionClient(url, key);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm vitest run tests/unit/evolution-client.test.ts`
Expected: PASS

- [ ] **Step 6: Teste + implementação do adapter de ciclo de vida (mesmo padrão de `waha-lifecycle.ts`)**

```typescript
// tests/unit/evolution-lifecycle-adapter.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const createInstance = vi.fn();
const connect = vi.fn();
const getConnectionState = vi.fn();

vi.mock("@/lib/evolution/client", () => ({
  getEvolutionClient: () => ({ createInstance, connect, getConnectionState }),
}));

import { evolutionLifecycleAdapter } from "@/lib/channels/adapters/evolution-lifecycle";

describe("evolutionLifecycleAdapter", () => {
  beforeEach(() => {
    createInstance.mockReset();
    connect.mockReset();
    getConnectionState.mockReset();
  });

  it("ensureSession cria a instância", async () => {
    createInstance.mockResolvedValue({ instanceToken: "tok" });
    await evolutionLifecycleAdapter.ensureSession("org-abc");
    expect(createInstance).toHaveBeenCalledWith("org-abc");
  });

  it("startSession chama connect", async () => {
    connect.mockResolvedValue("data:image/png;base64,AAA=");
    await evolutionLifecycleAdapter.startSession("org-abc");
    expect(connect).toHaveBeenCalledWith("org-abc");
  });

  it("getStatus combina connect (QR) + getConnectionState quando SCAN_QR_CODE", async () => {
    getConnectionState.mockResolvedValue("SCAN_QR_CODE");
    connect.mockResolvedValue("data:image/png;base64,AAA=");
    const status = await evolutionLifecycleAdapter.getStatus("org-abc");
    expect(status).toEqual({ status: "SCAN_QR_CODE", qrImageBase64: "data:image/png;base64,AAA=", phoneNumber: null });
  });

  it("getStatus não busca QR quando WORKING", async () => {
    getConnectionState.mockResolvedValue("WORKING");
    const status = await evolutionLifecycleAdapter.getStatus("org-abc");
    expect(connect).not.toHaveBeenCalled();
    expect(status).toEqual({ status: "WORKING", qrImageBase64: null, phoneNumber: null });
  });
});
```

```typescript
// lib/channels/adapters/evolution-lifecycle.ts
import { getEvolutionClient } from "@/lib/evolution/client";
import type { SessionLifecycleAdapter, SessionStatus } from "../session-lifecycle";

export const evolutionLifecycleAdapter: SessionLifecycleAdapter = {
  provider: "evolution",

  async ensureSession(sessionRef: string): Promise<void> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    await client.createInstance(sessionRef);
  },

  async startSession(sessionRef: string): Promise<void> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    await client.connect(sessionRef);
  },

  async getStatus(sessionRef: string): Promise<SessionStatus> {
    const client = getEvolutionClient();
    if (!client) throw new Error("evolution_not_configured");
    const status = await client.getConnectionState(sessionRef);
    // `phoneNumber` fica null aqui: a Evolution só devolve o número conectado
    // via /instance/fetchInstances, chamada separada que a Task 7 (UI) faz sob
    // demanda quando quer exibir — getStatus só cuida de status+QR.
    if (status !== "SCAN_QR_CODE") return { status, qrImageBase64: null, phoneNumber: null };
    const qr = await client.connect(sessionRef);
    return { status, qrImageBase64: qr, phoneNumber: null };
  },
};
```

- [ ] **Step 7: Rodar os dois testes novos + registrar no factory**

Run: `pnpm vitest run tests/unit/evolution-lifecycle-adapter.test.ts`
Expected: PASS

Em `lib/channels/index.ts`, troque `evolution: null` por `evolution: evolutionLifecycleAdapter` no `LIFECYCLE_ADAPTERS` (import de `./adapters/evolution-lifecycle`).

- [ ] **Step 8: `pnpm typecheck && pnpm test:unit`**

Expected: PASS

- [ ] **Step 9: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add lib/evolution/client.ts lib/channels/adapters/evolution-lifecycle.ts lib/channels/index.ts lib/env.ts .env.example tests/unit/evolution-client.test.ts tests/unit/evolution-lifecycle-adapter.test.ts && git commit -m "feat(evolution): client REST + adapter de ciclo de vida de sessao"
```

---

## Task 4: `ChannelAdapter` de envio (texto) + capabilities + wiring no seam de envio

**Files:**
- Create: `lib/channels/adapters/evolution.ts`
- Modify: `lib/channels/capabilities.ts` (entrada `evolution`, idêntica ao `waha`)
- Modify: `lib/channels/index.ts` (`ADAPTERS.evolution`)
- Modify: `lib/channels/session-ref.ts` (3º ramo da tagged union `ChannelSessionRef`)
- Modify: `tests/unit/channel-capability-matrix.test.ts` (não é invariante congelado — está em `tests/unit/`; adiciona `"evolution"` a `PROVIDERS`)
- Test: `tests/unit/evolution-adapter.test.ts`

**Interfaces:**
- Consumes: `EvolutionClient.sendText` (Task 3).
- Produces: `evolutionAdapter: ChannelAdapter` — consumido por `getAdapter("evolution")` em `app/api/v1/messages/_handler.ts` e `lib/ai/runtime/agent.ts` (nenhuma mudança nesses dois arquivos: eles já leem `provider` do banco e chamam `getAdapter(provider)` genericamente).

- [ ] **Step 1: Capabilities — cópia exata do WAHA**

`lib/channels/capabilities.ts`:

```typescript
export const CHANNEL_CAPABILITIES: Record<ChannelProvider, ChannelCapabilities> = {
  waha: { /* ...existente, sem mudança... */ },
  meta_cloud: { /* ...existente, sem mudança... */ },
  // Mesma física do WAHA: Baileys por baixo, mesma auto-restrição (banRisk),
  // mesma ausência de janela de 24h. Ver spec §2 — capabilities idênticas de
  // propósito, não coincidência.
  evolution: {
    freeformOutsideWindow: true,
    requiresTemplates: false,
    banRisk: true,
    minIntervalMs: null,
    voiceNote: "server-convert",
    groups: "full",
    costPerMessage: false,
  },
};

export const CHANNEL_PROVIDER_EVOLUTION: ChannelProvider = "evolution";
```

- [ ] **Step 2: `session-ref.ts` ganha o 3º ramo**

```typescript
export type ChannelSessionRef =
  | { provider: "waha"; waha_session_name: string }
  | { provider: "meta_cloud"; meta_phone_number_id: string }
  | { provider: "evolution"; evolution_instance_name: string };

export const CHANNEL_SESSION_REF_COLUMNS =
  "provider, waha_session_name, meta_phone_number_id, evolution_instance_name";

export function resolveSessionRef(session: ChannelSessionRef): string {
  switch (session.provider) {
    case "meta_cloud":
      return session.meta_phone_number_id;
    case "waha":
      return session.waha_session_name;
    case "evolution":
      return session.evolution_instance_name;
  }
}
```

- [ ] **Step 3: Teste do `channel-capability-matrix.test.ts` — adiciona `"evolution"` (arquivo não congelado, editar é permitido)**

```typescript
const PROVIDERS: ChannelProvider[] = ["waha", "meta_cloud", "evolution"];
```

Run: `pnpm vitest run tests/unit/channel-capability-matrix.test.ts`
Expected: PASS (o teste já é genérico sobre `PROVIDERS`).

- [ ] **Step 4: Escrever o teste do `evolutionAdapter`**

```typescript
// tests/unit/evolution-adapter.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const sendText = vi.fn();
const sendMedia = vi.fn();

vi.mock("@/lib/evolution/client", () => ({
  getEvolutionClient: () => ({ sendText, sendMedia }),
}));

import { evolutionAdapter } from "@/lib/channels/adapters/evolution";

describe("evolutionAdapter", () => {
  beforeEach(() => {
    sendText.mockReset();
    sendMedia.mockReset();
  });

  it("resolveRecipient devolve só dígitos, sem sufixo, pra número; groupChatId cru pra grupo", () => {
    expect(
      evolutionAdapter.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: "+55 31 99999-8888",
        waIdentity: null,
      }),
    ).toBe("5531999998888");
    expect(
      evolutionAdapter.resolveRecipient({
        isGroup: true,
        groupChatId: "12036@g.us",
        phoneNumber: null,
        waIdentity: null,
      }),
    ).toBe("12036@g.us");
    expect(
      evolutionAdapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null }),
    ).toBeNull();
  });

  it("send de texto extrai o externalId de key.id", async () => {
    sendText.mockResolvedValue({ key: { id: "3EB0ABC" } });
    const res = await evolutionAdapter.send({
      sessionRef: "org-abc",
      to: "5531999998888",
      kind: "text",
      body: "oi",
    });
    expect(sendText).toHaveBeenCalledWith("org-abc", "5531999998888", "oi");
    expect(res).toEqual({ externalId: "3EB0ABC" });
  });

  it("send sem client configurado devolve externalId null (noop, não exceção)", async () => {
    vi.doMock("@/lib/evolution/client", () => ({ getEvolutionClient: () => null }));
    vi.resetModules();
    const { evolutionAdapter: adapterSemConfig } = await import("@/lib/channels/adapters/evolution");
    const res = await adapterSemConfig.send({ sessionRef: "x", to: "y", kind: "text", body: "oi" });
    expect(res).toEqual({ externalId: null });
  });
});
```

- [ ] **Step 5: Rodar e ver falhar, depois implementar**

Run: `pnpm vitest run tests/unit/evolution-adapter.test.ts` → FAIL (módulo não existe)

```typescript
// lib/channels/adapters/evolution.ts
/**
 * Adapter Evolution — mesmo papel burro do `waha.ts`: traduz formato e
 * delega ao `EvolutionClient`. Nenhuma regra de negócio aqui (ver
 * ChannelAdapter em ../types e restricao-de-canal.md).
 */
import { getEvolutionClient } from "@/lib/evolution/client";
import { evolutionSendPlanFor } from "@/lib/evolution/media-send";
import { parseEvolutionMessageId } from "@/lib/evolution/message-id";
import type { ChannelAdapter, OutboundEnvelope, RecipientInput } from "../types";

/** Só dígitos — a Evolution espera `number` cru, sem `@s.whatsapp.net`. */
function toDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const evolutionAdapter: ChannelAdapter = {
  provider: "evolution",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup) return input.groupChatId; // grupo: id cru, já no formato @g.us
    if (!input.phoneNumber) return null;
    const digits = toDigits(input.phoneNumber);
    return digits.length > 0 ? digits : null;
  },

  isConfigured(): boolean {
    return getEvolutionClient() !== null;
  },

  codes: {
    notConfigured: "evolution_not_configured",
    sendFailed: "evolution_error",
    unknownError: "evolution_unknown",
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    const client = getEvolutionClient();
    if (!client) return { externalId: null };

    const res = envelope.media
      ? await client.sendMedia(envelope.sessionRef, envelope.to, evolutionSendPlanFor(envelope.kind, envelope.media))
      : await client.sendText(envelope.sessionRef, envelope.to, envelope.body ?? "");

    return { externalId: parseEvolutionMessageId(res) };
  },
};
```

```typescript
// lib/evolution/message-id.ts
/** Extrai o id externo de uma resposta de envio da Evolution: sempre `{ key: { id } }`. */
export function parseEvolutionMessageId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { key?: { id?: unknown } };
  if (typeof r.key === "object" && r.key !== null && typeof r.key.id === "string") return r.key.id;
  return null;
}
```

`lib/evolution/media-send.ts` — implementado na Task 5 (Step 5 chama `evolutionSendPlanFor`, então crie um stub mínimo aqui só para o typecheck não quebrar, e a Task 5 substitui):

```typescript
// lib/evolution/media-send.ts (stub — Task 5 substitui pelo real)
import type { OutboundMedia } from "@/lib/waha/media-send";

export interface EvolutionSendPlan {
  endpoint: string;
  payload: Record<string, unknown>;
}

export function evolutionSendPlanFor(_kind: string, _media: OutboundMedia): EvolutionSendPlan {
  throw new Error("not_implemented_yet"); // Task 5 implementa de verdade
}
```

- [ ] **Step 6: Registrar no seam de envio**

`lib/channels/index.ts`:

```typescript
import { evolutionAdapter } from "./adapters/evolution";

const ADAPTERS: Record<ChannelProvider, ChannelAdapter | null> = {
  waha: wahaAdapter,
  meta_cloud: metaCloudAdapter,
  evolution: evolutionAdapter,
};
```

- [ ] **Step 7: Rodar tudo**

Run: `pnpm vitest run tests/unit/evolution-adapter.test.ts tests/unit/channel-capability-matrix.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add lib/channels/adapters/evolution.ts lib/evolution/message-id.ts lib/evolution/media-send.ts lib/channels/capabilities.ts lib/channels/index.ts lib/channels/session-ref.ts tests/unit/evolution-adapter.test.ts tests/unit/channel-capability-matrix.test.ts && git commit -m "feat(evolution): adapter de envio de texto + capabilities + wiring no seam"
```

---

## Task 5: Mídia — envio e recebimento

**Files:**
- Modify: `lib/evolution/media-send.ts` (substitui o stub da Task 4)
- Create: `lib/messaging/media/evolution-source.ts`
- Test: `tests/unit/evolution-media-send.test.ts`, `tests/unit/evolution-media-source.test.ts`

**Interfaces:**
- Produces: `evolutionSendPlanFor(kind, media): EvolutionSendPlan` (consumido pela Task 4, já com o import pronto), `fetchEvolutionMedia(mediaUrl, hintMime?): Promise<FetchedMedia>` (mesmo shape de `fetchWahaMedia`).

- [ ] **Step 1: Teste do plano de envio de mídia**

```typescript
// tests/unit/evolution-media-send.test.ts
import { describe, expect, it } from "vitest";
import { evolutionSendPlanFor } from "@/lib/evolution/media-send";

describe("evolutionSendPlanFor", () => {
  it("image/video/document usam sendMedia com mediatype certo", () => {
    const media = { url: "https://x/img.jpg", mime: "image/jpeg", caption: "legenda" };
    expect(evolutionSendPlanFor("image", media)).toEqual({
      endpoint: "sendMedia",
      payload: { mediatype: "image", mimetype: "image/jpeg", media: "https://x/img.jpg", caption: "legenda" },
    });
  });

  it("audio usa sendWhatsAppAudio, sem mediatype", () => {
    const media = { url: "https://x/audio.ogg", mime: "audio/ogg" };
    expect(evolutionSendPlanFor("audio", media)).toEqual({
      endpoint: "sendWhatsAppAudio",
      payload: { audio: "https://x/audio.ogg" },
    });
  });

  it("document inclui fileName quando presente", () => {
    const media = { url: "https://x/doc.pdf", mime: "application/pdf", filename: "contrato.pdf" };
    expect(evolutionSendPlanFor("document", media)).toEqual({
      endpoint: "sendMedia",
      payload: { mediatype: "document", mimetype: "application/pdf", media: "https://x/doc.pdf", fileName: "contrato.pdf" },
    });
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
// lib/evolution/media-send.ts
import type { OutboundMedia } from "@/lib/waha/media-send";

export interface EvolutionSendPlan {
  endpoint: "sendMedia" | "sendWhatsAppAudio";
  payload: Record<string, unknown>;
}

/** `mediatype` da Evolution: image | video | document (áudio tem endpoint próprio). */
function mediatypeFor(kind: string): string {
  if (kind === "image" || kind === "video") return kind;
  return "document";
}

export function evolutionSendPlanFor(kind: string, media: OutboundMedia): EvolutionSendPlan {
  if (kind === "audio") {
    return { endpoint: "sendWhatsAppAudio", payload: { audio: media.url } };
  }
  const payload: Record<string, unknown> = {
    mediatype: mediatypeFor(kind),
    mimetype: media.mime,
    media: media.url,
  };
  if (media.filename) payload.fileName = media.filename;
  if (media.caption) payload.caption = media.caption;
  return { endpoint: "sendMedia", payload };
}
```

- [ ] **Step 3: Teste + implementação do `fetchEvolutionMedia` (mesma mitigação de SSRF do WAHA)**

```typescript
// tests/unit/evolution-media-source.test.ts
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
```

```typescript
// lib/messaging/media/evolution-source.ts
/**
 * MediaSource da Evolution: mesma mitigação de SSRF de `waha-source.ts` — a
 * URL anunciada no webhook NUNCA decide o host; só path+query sobrevivem,
 * resolvidos sobre EVOLUTION_API_BASE_URL.
 */
import { MAX_MEDIA_BYTES, MediaTooLargeError, type FetchedMedia } from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchEvolutionMedia(mediaUrl: string, hintMime?: string | null): Promise<FetchedMedia> {
  const base = process.env.EVOLUTION_API_BASE_URL;
  let url: URL;
  try {
    const advertised = new URL(mediaUrl);
    url = new URL(advertised.pathname + advertised.search, base ?? "");
  } catch {
    throw new Error("evolution_media_untrusted_host");
  }

  const apiKey = process.env.EVOLUTION_API_KEY;
  const res = await fetch(url.toString(), {
    headers: apiKey ? { apikey: apiKey } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`evolution_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const mime = res.headers.get("content-type") || hintMime || "application/octet-stream";
  return { buffer, mime };
}
```

- [ ] **Step 4: Rodar tudo**

Run: `pnpm vitest run tests/unit/evolution-media-send.test.ts tests/unit/evolution-media-source.test.ts tests/unit/evolution-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add lib/evolution/media-send.ts lib/messaging/media/evolution-source.ts tests/unit/evolution-media-send.test.ts tests/unit/evolution-media-source.test.ts && git commit -m "feat(evolution): envio e recebimento de midia"
```

---

## Task 6: Webhook — autenticação, rota, ingestão de mensagens inbound

**Files:**
- Create: `lib/evolution/webhook-auth.ts`
- Create: `lib/evolution/ingest.ts`
- Create: `app/api/v1/webhooks/evolution/[token]/route.ts`
- Test: `tests/unit/evolution-webhook-auth.test.ts`, `tests/unit/evolution-ingest.test.ts`

**⚠️ Nota de fidelidade:** os formatos de payload usados abaixo (`MESSAGES_UPSERT`, `CONNECTION_UPDATE`) vêm de fontes públicas consistentes da Evolution API v2 (múltiplos exemplos convergem nos mesmos nomes de campo: `data.key.remoteJid/fromMe/id`, `data.pushName`, `data.message.conversation`, `data.messageType`, `data.messageTimestamp`). **Antes de considerar esta task pronta, valide contra um evento REAL** (Step 6) — se o formato divergir em algum campo, ajuste `lib/evolution/ingest.ts` e o teste, documentando a diferença num comentário.

**Interfaces:**
- Consumes: `verifyHmacSha512`-equivalente não é usado aqui (Evolution não assina corpo) — usa apenas `timingSafeEqual`. `dispatchWahaEvent` de `lib/waha/ingest.ts` NÃO é chamado — este pipeline é próprio (mesma forma, contrato interno equivalente: insere em `messages`, chama as mesmas RPCs `fn_upsert_wa_contact`/`fn_upsert_wa_conversation`/`fn_mark_conversation_message`/`emit_event`).
- Produces: `authenticateEvolutionWebhook`, `dispatchEvolutionEvent(admin, session, envelope, requestId)`.

- [ ] **Step 1: Auth — teste e implementação (header-secreto + timingSafeEqual, fail-closed)**

```typescript
// tests/unit/evolution-webhook-auth.test.ts
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
```

```typescript
// lib/evolution/webhook-auth.ts
/**
 * Autenticação do webhook Evolution — fail-closed, igual em espírito ao WAHA
 * (lib/waha/webhook-auth.ts), mas SEM HMAC de corpo: a Evolution não assina o
 * payload nativamente (só suporta `headers` customizados no /webhook/set), então
 * a defesa aqui é comparar um header-secreto compartilhado com
 * `crypto.timingSafeEqual` — mais fraco que HMAC-do-corpo (não prova
 * integridade do payload, só posse do secret), mas sem timing leak. Diferente
 * do WAHA, NÃO existe modo "sem assinatura, aceita mesmo assim": sem header
 * secreto a rota rejeita sempre, porque não há alternativa "Core não assina"
 * aqui — o header é a única defesa que existe.
 */
import { timingSafeEqual } from "node:crypto";

export type EvolutionWebhookAuth = { ok: true } | { ok: false; reason: "bad_secret" | "missing_secret" };

export interface EvolutionWebhookAuthInput {
  secretHeader: string | null;
  /** Segredo por sessão já decifrado (null quando não há/não decifrou). */
  sessionSecret: string | null;
}

export function authenticateEvolutionWebhook(input: EvolutionWebhookAuthInput): EvolutionWebhookAuth {
  const { secretHeader, sessionSecret } = input;
  if (!secretHeader || !sessionSecret) return { ok: false, reason: "missing_secret" };
  const a = Buffer.from(secretHeader, "utf8");
  const b = Buffer.from(sessionSecret, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "bad_secret" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_secret" };
}
```

- [ ] **Step 2: Rodar**

Run: `pnpm vitest run tests/unit/evolution-webhook-auth.test.ts`
Expected: PASS

- [ ] **Step 3: Teste da ingestão de `MESSAGES_UPSERT` e `CONNECTION_UPDATE`**

```typescript
// tests/unit/evolution-ingest.test.ts
import { describe, expect, it, vi } from "vitest";
import { parseRemoteJid, resolveEvolutionMessageType, dispatchEvolutionEvent } from "@/lib/evolution/ingest";

describe("parseRemoteJid", () => {
  it("@s.whatsapp.net vira phone E.164", () => {
    expect(parseRemoteJid("5531999998888@s.whatsapp.net")).toEqual({ kind: "phone", phone: "+5531999998888", lid: null });
  });
  it("@g.us vira group", () => {
    expect(parseRemoteJid("12036@g.us")).toEqual({ kind: "group", phone: null, lid: null });
  });
  it("@lid vira lid", () => {
    expect(parseRemoteJid("998877@lid")).toEqual({ kind: "lid", phone: null, lid: "998877" });
  });
});

describe("resolveEvolutionMessageType", () => {
  it("conversation/extendedTextMessage → text", () => {
    expect(resolveEvolutionMessageType("conversation", {})).toBe("text");
    expect(resolveEvolutionMessageType("extendedTextMessage", {})).toBe("text");
  });
  it("imageMessage/audioMessage/videoMessage/documentMessage/stickerMessage mapeiam 1:1", () => {
    expect(resolveEvolutionMessageType("imageMessage", {})).toBe("image");
    expect(resolveEvolutionMessageType("audioMessage", {})).toBe("audio");
    expect(resolveEvolutionMessageType("videoMessage", {})).toBe("video");
    expect(resolveEvolutionMessageType("documentMessage", {})).toBe("document");
    expect(resolveEvolutionMessageType("stickerMessage", {})).toBe("sticker");
  });
  it("tipo desconhecido cai em text", () => {
    expect(resolveEvolutionMessageType("pollCreationMessage", {})).toBe("text");
  });
});

describe("dispatchEvolutionEvent — MESSAGES_UPSERT inbound", () => {
  it("insere mensagem, contato e conversa via RPC, e emite ai_agent.dispatch_requested", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "id-fake", error: null });
    const insertSelect = vi.fn().mockResolvedValue({ data: { id: "msg-1" }, error: null });
    const admin = {
      rpc,
      from: vi.fn(() => ({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: insertSelect })) })),
      })),
    } as unknown as Parameters<typeof dispatchEvolutionEvent>[0];

    const session = { id: "sess-1", organization_id: "org-1" };
    const envelope = {
      event: "MESSAGES_UPSERT",
      data: {
        key: { remoteJid: "5531999998888@s.whatsapp.net", fromMe: false, id: "3EB0C7B4" },
        pushName: "John Doe",
        message: { conversation: "oi" },
        messageType: "conversation",
        messageTimestamp: 1709553296,
      },
    };

    await dispatchEvolutionEvent(admin, session as never, envelope as never, "req-1");

    expect(rpc).toHaveBeenCalledWith(
      "fn_upsert_wa_contact",
      expect.objectContaining({ p_org: "org-1", p_kind: "phone", p_phone: "+5531999998888" }),
    );
  });
});
```

- [ ] **Step 4: Rodar e ver falhar, depois implementar**

Run: `pnpm vitest run tests/unit/evolution-ingest.test.ts` → FAIL (módulo não existe)

```typescript
// lib/evolution/ingest.ts
/**
 * Pipeline de ingestão da Evolution — mesmo contrato interno de
 * `lib/waha/ingest.ts` (dispatchWahaEvent), formato de payload diferente.
 * Reusa as MESMAS RPCs atômicas (fn_upsert_wa_contact/fn_upsert_wa_conversation/
 * fn_mark_conversation_message) — o resto do pipeline (timeline, disparo do
 * agente) não sabe e não deve saber de onde a mensagem veio.
 *
 * remoteJid segue o padrão Baileys (mesma lib que o WAHA/NOWEB usa por baixo):
 * `{numero}@s.whatsapp.net` | `{lid}@lid` | `{id}@g.us`.
 */
import { audit } from "@/lib/audit";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

interface Session {
  id: string;
  organization_id: string;
}

export type ChatIdentity =
  | { kind: "phone"; phone: string; lid: null }
  | { kind: "lid"; phone: null; lid: string }
  | { kind: "group"; phone: null; lid: null };

export function parseRemoteJid(jid: string): ChatIdentity {
  if (jid.endsWith("@g.us")) return { kind: "group", phone: null, lid: null };
  if (jid.endsWith("@lid")) return { kind: "lid", phone: null, lid: jid.replace(/@.*$/, "") };
  if (jid.endsWith("@s.whatsapp.net")) {
    const digits = jid.replace(/@.*$/, "").replace(/^\+/, "");
    return { kind: "phone", phone: "+" + digits, lid: null };
  }
  return { kind: "group", phone: null, lid: null };
}

const MESSAGE_KEY_TYPE: Record<string, string> = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
};

/** `messageType` cru da Evolution → vocabulário de messages.type do CRM. */
export function resolveEvolutionMessageType(messageType: string, messageObj: Record<string, unknown>): string {
  if (messageType in MESSAGE_KEY_TYPE) return MESSAGE_KEY_TYPE[messageType]!;
  if (messageType === "conversation" || messageType === "extendedTextMessage") return "text";
  for (const key of Object.keys(MESSAGE_KEY_TYPE)) {
    if (key in messageObj) return MESSAGE_KEY_TYPE[key]!;
  }
  return "text";
}

function bodyOf(message: Record<string, unknown>): string | null {
  if (typeof message.conversation === "string") return message.conversation;
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  return null;
}

interface EvolutionMessageData {
  key: { remoteJid: string; fromMe: boolean; id: string };
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
}

export interface EvolutionEnvelope {
  event?: string;
  data?: EvolutionMessageData | { state?: string };
}

async function upsertContact(
  admin: Admin,
  orgId: string,
  parsed: ChatIdentity,
  jid: string,
  notifyName: string | null,
): Promise<string | null> {
  if (parsed.kind === "group") return null;
  const { data, error } = await admin.rpc("fn_upsert_wa_contact" as never, {
    p_org: orgId,
    p_kind: parsed.kind,
    p_phone: parsed.kind === "phone" ? parsed.phone : null,
    p_lid: parsed.kind === "lid" ? parsed.lid : null,
    p_chat_id: jid,
    p_notify: notifyName ?? null,
  } as never);
  if (error) {
    console.error("[evolution.ingest] fn_upsert_wa_contact failed", error.message);
    return null;
  }
  return (data as string) ?? null;
}

async function upsertConversation(admin: Admin, orgId: string, contactId: string, sessionId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("fn_upsert_wa_conversation" as never, {
    p_org: orgId,
    p_contact: contactId,
    p_session: sessionId,
  } as never);
  if (error) {
    console.error("[evolution.ingest] fn_upsert_wa_conversation failed", error.message);
    return null;
  }
  return (data as string) ?? null;
}

const STOP_RX = /\b(STOP|PARAR|SAIR|UNSUBSCRIBE)\b/i;

async function handleInbound(admin: Admin, session: Session, data: EvolutionMessageData, requestId: string): Promise<void> {
  if (data.key.fromMe) return; // outbound do próprio operador: Task futura, fora do v1 (spec §10 não lista — ver nota abaixo)
  const parsed = parseRemoteJid(data.key.remoteJid);
  if (parsed.kind === "group") return;
  const body = data.message ? bodyOf(data.message) : null;
  if (!body) return; // v1: só texto. Mídia inbound entra quando o worker de persist assinar este pipeline (Task 5 cobre só outbound + fetch cru).

  const contactId = await upsertContact(admin, session.organization_id, parsed, data.key.remoteJid, data.pushName ?? null);
  if (!contactId) return;
  const conversationId = await upsertConversation(admin, session.organization_id, contactId, session.id);
  if (!conversationId) return;

  const now = new Date().toISOString();
  const type = resolveEvolutionMessageType(data.messageType ?? "conversation", data.message ?? {});
  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      organization_id: session.organization_id,
      conversation_id: conversationId,
      channel_session_id: session.id,
      contact_id: contactId,
      external_id: data.key.id,
      type,
      direction: "inbound",
      status: "delivered",
      body,
      sent_via: "external_device",
      sent_at: data.messageTimestamp ? new Date(data.messageTimestamp * 1000).toISOString() : now,
      delivered_at: now,
      metadata: { raw_message_type: data.messageType },
    })
    .select("id")
    .maybeSingle();

  if (insertErr && insertErr.code !== "23505") {
    console.error("[evolution.ingest] message insert failed", insertErr.message);
    return;
  }
  if (insertErr?.code === "23505") return;

  await admin.rpc("fn_mark_conversation_message" as never, {
    p_conv: conversationId,
    p_direction: "inbound",
    p_preview: body.slice(0, 280),
    p_at: now,
  } as never);

  if (body && STOP_RX.test(body)) {
    await admin.from("contacts").update({ is_blocked: true, blocked_reason: "stop_keyword", blocked_at: now }).eq("id", contactId);
    await audit({
      action: "contact.blocked",
      organizationId: session.organization_id,
      resourceType: "contact",
      requestId,
      metadata: { reason: "stop_keyword", contact_id: contactId },
    });
  }

  await audit({
    action: "message.received",
    organizationId: session.organization_id,
    resourceType: "message",
    requestId,
    metadata: { conversation_id: conversationId, type, external_id: data.key.id },
  });

  if (inserted?.id) {
    const inboundMessageId = inserted.id;
    await admin
      .rpc("emit_event" as never, {
        p_event_type: "ai_agent.dispatch_requested",
        p_entity_kind: "message",
        p_entity_id: inboundMessageId,
        p_payload: {
          organization_id: session.organization_id,
          conversation_id: conversationId,
          contact_id: contactId,
          channel_session_id: session.id,
          inbound_message_id: inboundMessageId,
        },
        p_metadata: { source: "evolution_webhook", request_id: requestId },
        p_organization_id: session.organization_id,
      } as never)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error("[evolution.ingest] emit dispatch_requested failed", error.message);
      });
  }
}

async function handleConnectionUpdate(admin: Admin, session: Session, data: { state?: string }): Promise<void> {
  const map: Record<string, string> = { open: "WORKING", connecting: "SCAN_QR_CODE", close: "STOPPED" };
  const status = map[data.state ?? ""];
  if (!status) return;
  await admin.from("channel_sessions").update({ status, last_status_change_at: new Date().toISOString() }).eq("id", session.id);
}

export async function dispatchEvolutionEvent(admin: Admin, session: Session, envelope: EvolutionEnvelope, requestId: string): Promise<void> {
  const eventType = (envelope.event ?? "").toUpperCase();
  if (eventType === "MESSAGES_UPSERT") {
    await handleInbound(admin, session, envelope.data as EvolutionMessageData, requestId);
  } else if (eventType === "CONNECTION_UPDATE") {
    await handleConnectionUpdate(admin, session, envelope.data as { state?: string });
  }
  // MESSAGES_UPDATE (ack de entrega/leitura) e mensagem fromMe=true (operador
  // respondeu direto do celular) ficam para uma segunda iteração: o formato
  // exato do payload MESSAGES_UPDATE não foi confirmado contra uma instância
  // real durante este plano (ver nota de fidelidade no topo da Task 6) — captura
  // ao vivo primeiro (Step 6), parser depois.
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm vitest run tests/unit/evolution-ingest.test.ts`
Expected: PASS

- [ ] **Step 6: Validar contra instância real (bloqueante antes de dar a task por pronta)**

Suba Evolution API local (`docker compose up -d evolution-postgres evolution-redis evolution-api` — Task 8 cria esses serviços; se ainda não existirem nesta ordem de execução, use `docker run` direto com a imagem `evoapicloud/evolution-api:latest` e um Postgres/Redis efêmeros), crie uma instância, conecte via QR com um número de teste, e mande uma mensagem de texto pra esse número de outro celular. Aponte o webhook (`POST /webhook/set/{instance}`) pra um endpoint temporário (ex.: `pnpm dlx local-webhook-logger` ou um `console.log` numa rota descartável) e capture o `MESSAGES_UPSERT` cru. Compare campo a campo com o `EvolutionMessageData` acima; se algo divergir, ajuste o tipo e o parser, e documente a diferença como comentário em `lib/evolution/ingest.ts` (ex.: "medido ao vivo em <data>: campo X vem como Y, não Z como a doc pública sugeria").

- [ ] **Step 7: Rota do webhook**

```typescript
// app/api/v1/webhooks/evolution/[token]/route.ts
/**
 * POST /api/v1/webhooks/evolution/[token]
 *
 * Espelha app/api/v1/webhooks/waha/[token]/route.ts: lookup por
 * webhook_path_token -> autentica (header-secreto, não HMAC — ver
 * lib/evolution/webhook-auth.ts) -> loga em webhook_events_log ->
 * dispatchEvolutionEvent.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEvolutionEvent, type EvolutionEnvelope } from "@/lib/evolution/ingest";
import { authenticateEvolutionWebhook } from "@/lib/evolution/webhook-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;
  if (!token || token.length < 8) return fail("not_found", "unknown webhook token", 404, { requestId });

  const rawBody = await req.text();
  let envelope: EvolutionEnvelope;
  try {
    envelope = JSON.parse(rawBody) as EvolutionEnvelope;
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: session, error: sessErr } = await admin
    .from("channel_sessions")
    .select("id, organization_id, evolution_instance_name, webhook_secret_encrypted, status")
    .eq("webhook_path_token", token)
    .maybeSingle();

  if (sessErr) return fail("internal_error", sessErr.message, 500, { requestId });
  if (!session) return fail("not_found", "unknown webhook token", 404, { requestId });

  const secretHeader = req.headers.get("x-deskcomm-webhook-secret");
  let sessionSecret: string | null = null;
  try {
    const dec = await admin.rpc("fn_decrypt_oauth", { ciphertext: session.webhook_secret_encrypted });
    if (!dec.error && typeof dec.data === "string") sessionSecret = dec.data;
  } catch {
    sessionSecret = null;
  }

  const auth = authenticateEvolutionWebhook({ secretHeader, sessionSecret });
  if (!auth.ok) {
    await audit({
      action: "webhook.hmac_invalid",
      organizationId: session.organization_id,
      metadata: { provider: "evolution", session: session.evolution_instance_name, event: envelope.event, reason: auth.reason },
    });
    return fail("unauthenticated", auth.reason, 401, { requestId });
  }

  const headersJson: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("authorization") || key.toLowerCase() === "cookie") return;
    headersJson[key] = value;
  });
  await admin.from("webhook_events_log").insert({
    organization_id: session.organization_id,
    channel_session_id: session.id,
    provider: "evolution",
    webhook_path_token: token,
    http_method: "POST",
    headers: headersJson,
    raw_body: rawBody,
    payload_parsed: envelope as unknown as Record<string, unknown>,
    signature_header: secretHeader ?? null,
    valid_signature: true,
    event_type: envelope.event ?? "unknown",
    status: "received",
    attempts: 0,
  });

  try {
    await dispatchEvolutionEvent(admin, session, envelope, requestId);
  } catch (err) {
    console.error("[evolution.webhook] handler failed", err);
  }

  return ok({ accepted: true }, { requestId });
}
```

- [ ] **Step 8: `pnpm typecheck && pnpm test:unit`**

Expected: PASS

- [ ] **Step 9: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add lib/evolution/webhook-auth.ts lib/evolution/ingest.ts "app/api/v1/webhooks/evolution/[token]/route.ts" tests/unit/evolution-webhook-auth.test.ts tests/unit/evolution-ingest.test.ts && git commit -m "feat(evolution): webhook auth + ingestao de mensagens inbound"
```

---

## Task 7: UI — seletor de provider em onboarding e em Conexões

**Files:**
- Modify: `app/onboarding/connect-whatsapp/_client.tsx`
- Modify: `components/connections/ConnectionsClient.tsx`
- Modify: `app/api/v1/onboarding/whatsapp/session/route.ts` (aceita `?provider=waha|evolution`, default `waha`)
- Modify: `app/api/v1/onboarding/whatsapp/qr/route.ts` (generaliza pra usar `getSessionLifecycleAdapter`, não só WAHA)

**Interfaces:**
- Consumes: `getSessionLifecycleAdapter(provider)` (Task 2/3), `SessionStatus.qrImageBase64` (já em base64 pronto — muda o `<img>` de `src="/api/.../qr"` proxy binário pra `src={qrImageBase64}` direto, mais simples que o proxy do WAHA).

- [ ] **Step 1: Generalizar a rota de sessão pra aceitar `provider`**

Em `app/api/v1/onboarding/whatsapp/session/route.ts`: troque `defaultSessionName` pra aceitar o provider no nome (`org_${orgId.slice(0,8)}` continua igual — o nome de sessão/instância não precisa mudar, só qual client/adapter é chamado). Leia `provider` de `searchParams` (`GET`) e do body (`POST`), default `"waha"`, valide contra `["waha", "evolution"]` (`fail("invalid_request", ...)` se outro valor). Troque `getWahaClient()`/chamadas diretas por `getSessionLifecycleAdapter(provider)`. `ensureChannelSession` passa a gravar a coluna certa (`waha_session_name` OU `evolution_instance_name`) conforme o `provider` recebido, e o `engine` grava `null` quando `provider === "evolution"` (a coluna é WAHA-específica).

- [ ] **Step 2: Seletor de provider na tela de onboarding**

Em `app/onboarding/connect-whatsapp/_client.tsx`, antes do primeiro `POST` de criação de sessão, adicione um estado `provider: "waha" | "evolution"` com dois botões (`<button onClick={() => setProvider("waha")}>WAHA</button>` / idem Evolution), e inclua `provider` como query param (`GET`) e no body (`POST`) das chamadas existentes à rota de sessão. Enquanto o usuário não escolheu, mostre os dois botões; depois de escolher, siga o fluxo de poll que já existe (sem mudança de lógica, só passando `provider` adiante).

- [ ] **Step 3: QR de Evolution não passa pelo proxy binário do WAHA**

`SessionStatus.qrImageBase64` já vem em base64 pronto (`data:image/png;base64,...`) — para Evolution, renderize `<img src={qrImageBase64} />` direto no client, sem chamar `/api/v1/onboarding/whatsapp/qr`. Para WAHA, mantenha o proxy existente (não regride comportamento provado). A branch fica no componente: `provider === "evolution" ? <img src={status.qrImageBase64} /> : <img src="/api/v1/onboarding/whatsapp/qr" />`.

- [ ] **Step 4: Mesmo seletor em `components/connections/ConnectionsClient.tsx`**

Mesma lógica do Step 2/3, na tela de gestão pós-onboarding — reaproveite o mesmo componente de seletor extraído (`<ProviderPicker value={provider} onChange={setProvider} />`, novo componente pequeno em `components/connections/ProviderPicker.tsx`) para não duplicar o par de botões nas duas telas.

- [ ] **Step 5: Teste manual (Playwright smoke, mockando o client Evolution — não o servidor real)**

Crie `tests/e2e/connect-whatsapp-evolution.spec.ts` seguindo o padrão dos specs WAHA já existentes: mocka a resposta da rota `/api/v1/onboarding/whatsapp/session?provider=evolution` (via `page.route`) devolvendo `{ status: "SCAN_QR_CODE", session: "org_abc" }` e a de status subsequente devolvendo `qrImageBase64`, confirma que o `<img>` aparece com o `src` esperado ao escolher "Evolution API".

- [ ] **Step 6: `pnpm test:e2e` (specs WAHA existentes não podem regredir) + `pnpm typecheck`**

Expected: PASS

- [ ] **Step 7: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add app/onboarding/connect-whatsapp/_client.tsx components/connections/ConnectionsClient.tsx components/connections/ProviderPicker.tsx app/api/v1/onboarding/whatsapp/session/route.ts app/api/v1/onboarding/whatsapp/qr/route.ts tests/e2e/connect-whatsapp-evolution.spec.ts && git commit -m "feat(ui): seletor de provider (WAHA/Evolution) nas telas de conexao"
```

---

## Task 8: Doutrina, lint, docker-compose (dev)

**Files:**
- Modify: `CLAUDE.md` (nova seção "Evolution API", espelhando a seção WAHA)
- Modify: `docs/doctrine/restricao-de-canal.md` (3ª coluna na matriz capability×provider)
- Modify: `scripts/lint-channels.ts` (regex `FORBIDDEN`, `ALLOWED`, `KNOWN_DEBT`)
- Modify: `docker-compose.yml` (serviços `evolution-postgres`, `evolution-redis`, `evolution-api`)
- Modify: `.env.example` já feito na Task 3 — conferir aqui que ficou completo

**Interfaces:** nenhuma — só doutrina/enforcement/infra local.

- [ ] **Step 1: `CLAUDE.md` — nova seção "Evolution API" logo após a seção "WAHA"**

```markdown
### Evolution API (provider alternativo, grátis)

- Engine Baileys (mesmo motor não-oficial do WAHA NOWEB) — **mesmo risco de banimento**, mesma doutrina de anti-banimento se aplica sem alteração
- Imagem `evoapicloud/evolution-api`; precisa de Postgres + Redis próprios (diferente do WAHA, que é standalone)
- Auth: header `apikey` (não `Authorization: Bearer`, não `X-Api-Key`)
- Sem HMAC de corpo nativo — webhook autentica por header customizado comparado com `crypto.timingSafeEqual` (`lib/evolution/webhook-auth.ts`)
- Credencial por sessão (`channel_sessions.evolution_instance_name`/`evolution_token_encrypted`, cifrada) — nunca env global por organização
- Endpoints principais: `POST /instance/create`, `GET /instance/connect/{name}`, `GET /instance/connectionState/{name}`, `POST /message/sendText/{name}`, `POST /message/sendMedia/{name}`, `POST /message/sendWhatsAppAudio/{name}`
```

- [ ] **Step 2: `docs/doctrine/restricao-de-canal.md` — ler a matriz existente e acrescentar a coluna `evolution` (idêntica à de `waha` em toda linha)**

Abra o arquivo, localize a tabela/matriz capability×provider (seção "invariante 2" ou onde a doutrina lista as capabilities por provider) e adicione `evolution` com os mesmos valores de `waha` em cada capability, com uma nota de rodapé: "evolution herda a física do waha (mesma engine Baileys) — ver `lib/channels/capabilities.ts`".

- [ ] **Step 3: `scripts/lint-channels.ts`**

```typescript
const FORBIDDEN = /\b(waha|WAHA|meta_cloud|graph\.facebook\.com|evolution)\b/;
```

`ALLOWED` ganha `/^lib\/evolution\//` (mesma exceção que `lib/waha/` já tem — é o transporte, não uma feature perguntando identidade).

`KNOWN_DEBT` ganha uma entrada nova para as duas peças de transporte que citam "evolution" fora de `lib/evolution/`/`lib/channels/`:

```typescript
{
  reason:
    "Superfície de TRANSPORTE do provider Evolution (webhook receiver, MediaSource), " +
    "mesma natureza da entrada 'transporte WAHA' acima — não são features " +
    "perguntando identidade, são o próprio canal.",
  files: [
    "app/api/v1/webhooks/evolution/[token]/route.ts",
    "lib/messaging/media/evolution-source.ts",
  ],
},
```

- [ ] **Step 4: Rodar o lint**

Run: `pnpm exec tsx scripts/lint-channels.ts` (ou o script npm que o `pnpm lint`/`pnpm gov:verify` já encadeia — confira `package.json`)
Expected: `lint-channels: ok (N arquivos de dívida conhecida, nenhum novo)`

- [ ] **Step 5: `docker-compose.yml` — três serviços novos (Evolution precisa de Postgres+Redis próprios, diferente do WAHA)**

```yaml
  evolution-postgres:
    image: postgres:15
    container_name: deskcomm-evolution-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evolution
      POSTGRES_DB: evolution
    volumes:
      - evolution-postgres-data:/var/lib/postgresql/data

  evolution-redis:
    image: redis:7-alpine
    container_name: deskcomm-evolution-redis
    restart: unless-stopped
    volumes:
      - evolution-redis-data:/data

  evolution-api:
    image: evoapicloud/evolution-api:latest
    container_name: deskcomm-evolution-api
    restart: unless-stopped
    ports:
      - "8085:8080"
    depends_on:
      - evolution-postgres
      - evolution-redis
    environment:
      # Admin key — mesma que EVOLUTION_API_KEY no .env.local do app.
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:evolution@evolution-postgres:5432/evolution
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://evolution-redis:6379
    volumes:
      - evolution-instances:/evolution/instances

volumes:
  # ...volumes existentes (waha-data, waha-media)...
  evolution-postgres-data:
  evolution-redis-data:
  evolution-instances:
```

Ajuste `EVOLUTION_API_BASE_URL` no `.env.example`/`.env.local` de dev para `http://localhost:8085` (porta host mapeada).

- [ ] **Step 6: Subir e verificar manualmente**

```bash
docker compose up -d evolution-postgres evolution-redis evolution-api
curl -s http://localhost:8085/ -H "apikey: $EVOLUTION_API_KEY"
```

Expected: resposta 200 da Evolution API (não conexão recusada).

- [ ] **Step 7: Nota explícita — fora de escopo, follow-up necessário**

Registre no PR/commit desta task (corpo do commit ou comentário): *"O `docker-compose.yml` cobre DEV LOCAL. O self-host de produção real usa `hostgator-setup-kit/install.sh`, que hoje só sabe provisionar WAHA — Evolution API não fica disponível pra quem instala via HostGator até esse kit ganhar suporte também. Item separado, fora deste plano."*

- [ ] **Step 8: Commit (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add CLAUDE.md docs/doctrine/restricao-de-canal.md scripts/lint-channels.ts docker-compose.yml .env.example && git commit -m "docs+lint+infra: doutrina Evolution API, lint-channels e docker-compose dev"
```

---

## Task 9: Varredura final

**Files:** nenhum arquivo novo — só execução.

- [ ] **Step 1: `pnpm typecheck`** — Expected: 0 erros
- [ ] **Step 2: `pnpm lint`** — Expected: 0 erros (inclui `lint-channels.ts`)
- [ ] **Step 3: `pnpm test:unit`** — Expected: PASS, incluindo todos os arquivos `evolution-*.test.ts` e `channel-capability-matrix.test.ts` atualizado
- [ ] **Step 4: `pnpm test:db`** — Expected: PASS, incluindo `channel-provider-schema.test.ts` (0087, congelado, agora fecha com 3 valores) e `evolution-channel-provider-schema.test.ts` (0098, novo)
- [ ] **Step 5: `pnpm test:e2e`** — Expected: specs WAHA existentes continuam verdes + o spec novo de Evolution (Task 7)
- [ ] **Step 6: QA visual manual** (doutrina do CLAUDE.md — "curl não conta"): com `docker compose up -d waha evolution-postgres evolution-redis evolution-api` no ar e o app rodando via `next build && next start` (não `next dev`), percorrer o onboarding escolhendo Evolution API, escanear o QR com um número de teste real, mandar uma mensagem de fora e confirmar que ela aparece no inbox — evidência em `.superpowers/evidence/`.
- [ ] **Step 7: Atualizar `docs/testing/user-journey-map.md`** com o novo caso de conexão via Evolution API (doutrina de QA Visual do CLAUDE.md exige o registro).
- [ ] **Step 8: Commit final (se houver git)**

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 && git add docs/testing/user-journey-map.md .superpowers/evidence/ && git commit -m "test(evolution): varredura final + evidencia visual do fluxo de conexao"
```
