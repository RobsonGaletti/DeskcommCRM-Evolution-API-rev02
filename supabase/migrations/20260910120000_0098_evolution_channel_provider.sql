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
