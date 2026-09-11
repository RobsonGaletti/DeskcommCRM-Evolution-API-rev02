-- 0099 — webhook_events_log ganha 'evolution' no vocabulário de provider.
--
-- A rota app/api/v1/webhooks/evolution/[token]/route.ts insere provider:'evolution'
-- em toda chamada, mas a constraint nascida antes deste plano só aceitava
-- 'waha'/'nuvemshop'/'generic' — todo INSERT falhava com 23514 e a tabela de
-- debug de webhook (a que existe justamente pra investigar payload real,
-- pendência já documentada na Task 6) ficava permanentemente vazia pra
-- Evolution, sem nenhum erro visível (o insert é fire-and-forget, mesmo
-- padrão do WAHA). Backfill: nenhum — só acrescenta um valor à união.

alter table public.webhook_events_log drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log add constraint webhook_events_log_provider_check
  check (provider = any (array['waha'::text, 'nuvemshop'::text, 'generic'::text, 'evolution'::text]));

-- Achado da revisão final (round único): o comentário em lib/evolution/client.ts
-- afirmava que o `instanceToken` devolvido por `createInstance` "é o que vai
-- cifrado" nesta coluna — nunca foi implementado (evolutionLifecycleAdapter.
-- ensureSession chama createInstance e descarta o retorno). A coluna existe
-- desde a 0098 mas nenhum código grava nela; v1 autentica toda chamada de
-- instância com a apikey admin compartilhada (suficiente pro modelo "um
-- servidor por instalação", spec §2). Documentando o estado real, não mudando
-- comportamento.
comment on column public.channel_sessions.evolution_token_encrypted is
  'Reservada para quando/se um wiring de credencial por-instância for implementado. Ainda NÃO é escrita por nenhum código — v1 usa apenas a apikey admin (EVOLUTION_API_KEY) para todas as chamadas de instância (ver lib/evolution/client.ts).';
