# Evolution API como terceiro `ChannelProvider` — Design

**Data:** 2026-09-10 · **Status:** aprovado por Rafael (brainstorming em 3 blocos) · **Escopo:** v1

## 1. Problema

WAHA Plus é a única forma de conectar WhatsApp hoje, e exige licença paga — fricção real para quem clona o projeto e self-hosta numa VPS só pra testar. Evolution API é uma alternativa madura, open-source (Apache 2.0 com cláusula de marca), gratuita, também construída sobre Baileys (WhatsApp Web não-oficial — **mesmo perfil de risco de banimento do WAHA NOWEB**, não um canal "mais seguro").

Decisão de produto: **manter as duas.** WAHA continua exatamente como está (doutrina, anti-ban, ~17 arquivos, telas provadas). Evolution API entra como segundo provider self-host, escolhido por organização — não por instalação inteira, porque `channel_sessions` já é 1:N por org (uma org pode ter múltiplos números/providers).

## 2. Decisões travadas

- **Terceiro valor de `ChannelProvider`**: `"evolution"`, ao lado de `"waha"` e `"meta_cloud"` já existentes em `lib/channels/types.ts:11`.
- **Só a rota Baileys/grátis da Evolution API.** A Evolution também oferece conexão via WhatsApp Cloud API oficial (paga) — fora de escopo, isso já existe no projeto como `meta_cloud`.
- **Credencial por sessão, cifrada** (BYO), não env global — mesmo padrão que `meta_cloud` já usa (`lib/channels/meta/credentials.ts`), e é o que `docs/doctrine/restricao-de-canal.md:169-172` manda para qualquer canal novo.
- **Capabilities idênticas ao WAHA.** Evolution é Baileys por baixo — mesma janela livre, mesmo `banRisk: true`, mesmo `voiceNote: "server-convert"`. Nenhuma feature de anti-ban muda; ela já lê `capabilitiesOf(provider)` (`lib/channels/capabilities.ts`), então herdar o objeto do WAHA é suficiente.
- **Um único servidor Evolution API por instalação** (mesmo modelo do WAHA hoje: uma `EVOLUTION_API_BASE_URL` + uma API key admin em env, usada só para *criar/gerenciar* instâncias; o segredo *por sessão* é o token da instância, não a admin key). BYO de servidor externo por org fica fora de escopo v1.
- **Sem HMAC de corpo no webhook** — Evolution não assina payload como o WAHA faz. Verificação vira header secreto customizado comparado com `timingSafeEqual` (documentado como decisão consciente, não gap escondido).

## 3. Lacuna descoberta durante o design: ciclo de vida de sessão não é abstraído

`lib/channels/types.ts` cobre só *envio* (`send`/`resolveRecipient`/`isConfigured`/`codes`). Criar instância, pegar QR e checar status são hoje código WAHA-específico solto em:
- `app/api/v1/onboarding/whatsapp/session/route.ts` (cria + inicia sessão, decide `ensureChannelSession`)
- `app/api/v1/onboarding/whatsapp/qr/route.ts` (proxy de imagem do QR)
- `components/connections/ConnectionsClient.tsx` (tela de gestão, mesmo padrão de poll)

Sem uma abstração aqui, Evolution vira um segundo caminho de código na UI em vez de um segundo provider de verdade — e a doutrina de `restricao-de-canal.md` (invariante 1: "nenhuma feature nomeia provider") quebraria na primeira tela. V1 desta feature introduz `SessionLifecycleAdapter` no mesmo módulo `lib/channels/`, e **migra WAHA para ele também** (não só Evolution):

```ts
// lib/channels/types.ts (adição)
export interface SessionStatus {
  status: "STARTING" | "SCAN_QR_CODE" | "WORKING" | "STOPPED" | "FAILED";
  qrImageBase64: string | null; // presente só quando status === SCAN_QR_CODE
  phoneNumber: string | null;
}

export interface SessionLifecycleAdapter {
  provider: ChannelProvider;
  /** Idempotente: cria a instância/sessão no provider se ainda não existir. */
  ensureSession(sessionRef: string): Promise<void>;
  /** Inicia a conexão (dispara geração de QR do lado do provider). */
  startSession(sessionRef: string): Promise<void>;
  getStatus(sessionRef: string): Promise<SessionStatus>;
}
```

As rotas de onboarding/conexão passam a chamar `getSessionLifecycleAdapter(provider)` (factory igual a `lib/channels/index.ts:getAdapter`) em vez de `WahaClient` direto. `WahaClient.startSession`/`getSessionQr` (`lib/waha/client.ts:22-49`) viram a implementação `waha` desse contrato; `EvolutionClient` (novo, `lib/evolution/client.ts`) vira a implementação `evolution`.

## 4. Modelo de dados

Migration nova (`NNNN_evolution_channel_provider.sql`), seguindo o padrão exato da `0087_channel_provider.sql` que introduziu `meta_cloud`:

```sql
alter table channel_sessions
  add column if not exists evolution_instance_name text,
  add column if not exists evolution_token_encrypted bytea;

-- CHECK existente (0087) ganha um ramo novo — dropar e recriar com o 3º caso:
alter table channel_sessions drop constraint if exists channel_sessions_provider_fields_check;
alter table channel_sessions add constraint channel_sessions_provider_fields_check check (
  (provider = 'waha' and waha_session_name is not null)
  or (provider = 'meta_cloud' and meta_phone_number_id is not null)
  or (provider = 'evolution' and evolution_instance_name is not null)
);
```

`evolution_token_encrypted` usa o mesmo mecanismo de `lib/webhooks/secrets.ts` (RPC `fn_encrypt_oauth`/`fn_decrypt_oauth`) que `meta_token_encrypted` e o `webhook_secret_encrypted` do WAHA já usam — nenhuma infra nova de criptografia.

Apêndice idempotente em `supabase/baseline.sql` + linha no `MANIFEST.md`, por doutrina.

## 5. Webhook

Rota nova `app/api/v1/webhooks/evolution/[token]/route.ts`, espelhando `app/api/v1/webhooks/waha/[token]/route.ts`:
- Resolve `channel_sessions` por `webhook_path_token` (mesma coluna, reusada — o token não carrega nome de provider).
- Autenticação: `authenticateEvolutionWebhook` (novo, `lib/evolution/webhook-auth.ts`) — compara um header próprio (ex.: `x-deskcomm-webhook-secret`, configurado por nós na criação da instância via campo `headers` do payload de `POST /webhook/set` da Evolution) contra o mesmo `channel_sessions.webhook_secret_encrypted` que o WAHA já usa (reusa a coluna e o mecanismo de cifra de `lib/webhooks/secrets.ts`; só a função de verificação muda — igualdade de header em vez de HMAC do corpo), com `crypto.timingSafeEqual`. Mesmo *fail-closed* do WAHA: sem correspondência, 401 e nada é processado.
- Loga em `webhook_events_log` (tabela já existente, reusada).
- `lib/evolution/ingest.ts` (novo) mapeia os eventos da Evolution (`MESSAGES_UPSERT`, `CONNECTION_UPDATE`, etc.) para o **mesmo contrato interno** que `dispatchWahaEvent` (`lib/waha/ingest.ts`) produz — o resto do pipeline (timeline, criação de lead, disparo de agente) não sabe e não deve saber que a mensagem veio da Evolution.

## 6. Mídia

- Saída: `lib/evolution/media-send.ts` (`evolutionSendPlanFor`), espelhando `lib/waha/media-send.ts:18-35` — mesmo padrão de signed URL do Supabase Storage, endpoint por tipo (`POST /message/sendMedia/{instance}` da Evolution cobre imagem/vídeo/documento; áudio tem endpoint próprio `sendWhatsAppAudio`).
- Entrada: `lib/messaging/media/evolution-source.ts` (`fetchEvolutionMedia`), espelhando a mitigação de SSRF de `fetchWahaMedia` (`lib/messaging/media/waha-source.ts:20-49`) — a URL é reconstruída a partir de `EVOLUTION_API_BASE_URL` do env, nunca do host que vier no payload do webhook.

## 7. UI

`app/onboarding/connect-whatsapp/_client.tsx` e `components/connections/ConnectionsClient.tsx` ganham um seletor de provider (dois botões: "WAHA" / "Evolution API") na criação de uma sessão nova. Depois de escolhido, ambas as telas chamam as mesmas rotas genéricas (que por baixo usam `getSessionLifecycleAdapter(provider)` do item 3) — nenhuma tela precisa saber o formato de resposta específico de cada provider além do que `SessionStatus` já normaliza.

## 8. Doutrina e enforcement

- `CLAUDE.md`: nova seção "Evolution API" espelhando a seção WAHA (engine Baileys, auth `apikey` header, ausência de HMAC nativo, endpoint de criação de instância, throttle igual ao WAHA).
- `docs/doctrine/restricao-de-canal.md`: matriz capability×provider ganha a 3ª coluna (idêntica à do WAHA, conforme item 2 das decisões travadas).
- `scripts/lint-channels.ts` e os testes de matriz capability×provider precisam reconhecer `"evolution"` — sem isso o lint fura silenciosamente (ele hoje só sabe de 2 providers).
- `docker-compose.yml`: serviço `evolution-api` como profile opcional, ao lado do profile WAHA existente — self-hoster escolhe subir um, outro, ou os dois.

## 9. Testes

- Teste de invariante (`tests/invariants/`): isolamento RLS não muda (nenhuma tabela nova, só colunas em `channel_sessions` já coberta).
- Teste de matriz capability×provider estendido para 3 providers (é o que já existe pra 2, só adiciona uma linha).
- Suíte de canal congelada (mencionada em `restricao-de-canal.md`) ganha um fixture `evolution`.
- E2E: tela de conexão com seletor de provider — smoke test cobrindo o fluxo "escolher Evolution → ver QR" (mock do client Evolution, não do servidor real, seguindo o padrão dos testes WAHA existentes).
- Webhook: teste unitário de `authenticateEvolutionWebhook` cobrindo timing-safe compare e fail-closed sem header.

## 10. Fora de escopo (v1)

- Evolution via WhatsApp Cloud API oficial (a paga) — `meta_cloud` já cobre esse caso de uso.
- BYO de servidor Evolution externo por organização (v1 assume um servidor por instalação, igual WAHA).
- Migração de sessões WAHA existentes para Evolution (troca de provider numa sessão já criada) — cada sessão nasce com um provider e não muda.
- Correção do bug pré-existente em `app/api/v1/onboarding/whatsapp/session/route.ts:44` (secret placeholder `Buffer.from([0])` no fluxo WAHA) — fora do escopo desta feature, mas deve ser registrado como issue separada, já que a migração do ciclo de vida (item 3) toca esse arquivo e pode ser a hora certa de também corrigi-lo.

## 11. Nota sobre o repositório

Este diretório de trabalho não tem `.git` (confirmado durante o brainstorming — só existe `.gitignore`). Esta spec foi escrita como arquivo normal, sem commit. Antes da fase de implementação, confirmar com o usuário se/quando o versionamento será restabelecido, já que a doutrina de migrations e a Definition of Done do projeto assumem um repositório git ativo.
