# Contributing — DeskcommCRM

## Antes de começar

1. Leia [`CLAUDE.md`](CLAUDE.md) — convenções não-negociáveis.
2. Leia [`ARCHITECTURE.md`](ARCHITECTURE.md) — visão de 1 página.
3. Identifique o epic de origem em [`docs/stories/epics/MASTER.md`](docs/stories/epics/MASTER.md).

## Fluxo

### Branches

```
feat/EPIC-XX-short-slug         # nova feature
fix/EPIC-XX-short-slug          # bug fix
chore/short-slug                # chore (deps, configs)
docs/short-slug                 # apenas docs
```

### Commits

Conventional commits + escopo `EPIC-XX`:

```
feat(EPIC-04): kanban drag-and-drop com fractional indexing
fix(EPIC-03): cron recover-stuck-messages marcando sending stuck >5min como failed
docs(EPIC-12): mark complete + wave log
```

Mensagens em PT-BR são aceitas. O assunto deve ser imperativo e ≤72 chars.

### epic-executor

Mudanças grandes seguem [`docs/stories/epics/`](docs/stories/epics/). O `epic-executor` consome o frontmatter (`epic_id`, `priority`, `depends_on`, `status`) e executa wave-by-wave com validação E2E continuous.

Ao finalizar um epic:

1. Atualizar frontmatter `status: pending → completed (partial: ...)` ou `status: completed`.
2. Append "Wave Completion Log" no final do arquivo.
3. Atualizar a row correspondente em `docs/stories/epics/MASTER.md`.

### PR process

1. Branch a partir de `main`.
2. Implementar. Adicionar testes (E2E pra fluxos, unit pra lógica pura).
3. **Definition of Done** — todos verdes:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test:unit`
   - `pnpm test:e2e` (subset relevante) — **opcional se você contribui de fora**, ver abaixo
   - RLS testada se feature toca tabela tenant-aware
   - Audit log emitido se há mutação relevante
   - Rate limit aplicado se rota é pública
   - Zod valida todo input externo
   - Sem `console.log` esquecido (use `lib/logger.ts`)
   - Env vars novas em `.env.example` + `lib/env.ts`
   - Docs atualizadas se mudou contrato (PRD/spec)
4. Abrir PR contra `main`. Description deve referenciar o epic e listar evidências (logs/screenshots dos testes).
5. CI deve passar antes de merge. Obrigatórios: `verify`, `invariants` (isolamento RLS) e `build-and-size`.

### Pegando uma issue — o protocolo

Existe porque já falhamos nisto: em 2026-07-30 abrimos uma issue, um contribuidor
começou a resolvê-la, e um mantenedor entregou a mesma correção **21 segundos antes**
sem que nenhum dos dois pudesse ver o outro. O trabalho dele foi para o lixo. As regras
abaixo são para que isso não se repita.

1. **Comente "pego esta" antes de codar.** Uma linha basta. Um mantenedor te atribui a
   issue — a partir daí ela é sua e ninguém mais mexe.
2. **Issue com pessoa atribuída não se duplica.** Se você quer ajudar mesmo assim,
   comente oferecendo; não abra PR concorrente.
3. **Mantenedor não implementa issue marcada `good first issue` ou `help wanted`** sem
   antes se atribuir a ela publicamente. Se você vir uma dessas sem dono, ela é sua para
   pegar — essa é a garantia que damos em troca do passo 1.
4. **Sem resposta em 48h depois do "pego esta"?** Comece assim mesmo e diga no PR. A
   demora é nossa, o custo não pode ser seu.

### Se você está contribuindo de fora (fork) — leia isto

Duas coisas vão parecer erro seu e não são:

- **O check `Vercel` fica vermelho** com "Authorization required to deploy". A `main` deste
  repositório faz deploy de produção, e a Vercel se recusa a construir PR de fork por
  segurança — o que está certo. **Ignore esse check**; ele não entra no gate de merge.
- **Os workflows ficam parados esperando aprovação** no seu primeiro PR. É política do
  GitHub para quem nunca contribuiu antes. Um mantenedor libera; do segundo PR em diante
  roda sozinho. Se demorar, comente no PR.

E sobre o `pnpm test:e2e` do DoD: rodar a suíte completa exige Docker, banco semeado e WAHA
local. **Não travamos PR externo nisso** — mande o que conseguiu provar (unit + descrição do
que testou na mão), que a prova de tela fica com o mantenedor. Exigir prova sem entregar a
ferramenta de produzi-la seria pedágio, não rigor.

### Anti-patterns proibidos

Lista completa em `CLAUDE.md`. Os mais letais:

- Trigger Postgres fazendo HTTP
- Service role usado em handler sem filtrar `organization_id` manualmente
- `getSession()` no backend (use `getUser()`)
- API key em query string
- Bearer plaintext no DB
- `console.log` em código merged

## Setup local

Veja [`README.md`](README.md) §Como rodar local.

## Suporte

Dúvidas: `rafael@maudibrasil.com.br`. Canal interno do BPO Discord (link no Notion).
