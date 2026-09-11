---
title: Inventário Exaustivo de Telas
parent: README.md
fonte: 01-sitemap.md + Sub-PRDs
version: 0.1
date: 2026-04-28
---

# 03 — Screen Inventory

> Tabela exaustiva de todas as telas mapeadas. Cada linha = uma tela única. Estados explícitos por tela. Total ~70 telas. Componentes-chave referenciados pelos Sub-PRDs.

## Convenção

- **Estados** padrão considerados pra TODA tela autenticada: `default | loading | empty | error | no-permission`. Listamos apenas os **adicionais ou notáveis** por tela.
- **Componentes** abreviados; specs completas em `docs/specs/`.
- **RT** = realtime channel.
- **Prio**: P0/P1/P2.

## A. Públicas + Auth (5 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio | Deps |
|---|---|---|---|---|---|---|---|
| 1 | `/` | todos | default, loading | `<MarketingLanding>` | — | P2 | — |
| 2 | `/login` | todos | default, error (creds inválidos), loading, locked (rate-limit) | `<LoginForm>` | — | P0 | Sub-PRD 01 §3.1 |
| 3 | `/login/mfa` | todos | default, error (TOTP errado), expired-session | `<TOTPInput>`, `<UseRecoveryCodeLink>` | — | P0 | idem |
| 4 | `/login/recovery` | todos | default, error, used-code | `<RecoveryCodeForm>` | — | P1 | idem |
| 5 | `/logout` | todos | redirect | — | — | P0 | — |

## B. Onboarding (8 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 6 | `/onboarding/welcome` | P3 | default, terms-not-accepted | `<TermsCheckbox>`, `<SetPasswordForm>` | — | P0 |
| 7 | `/onboarding/mfa-setup` | P3 admin, P2 | default, qr-loading, totp-invalid, success | `<TOTPSetup>`, `<RecoveryCodesPanel>` | — | P0 |
| 8 | `/onboarding/connect-whatsapp` | P3 | qr-loading, scan-qr, expired (60s), connected, failed | `<ChannelSessionCard>`, `<QRCodePanel>` | sim | P0 |
| 9 | `/onboarding/connect-nuvemshop` | P3 | default, redirecting, callback-success, callback-error, scopes-missing | `<NuvemshopConnectButton>`, `<SyncProgressBar>` | — | P0 |
| 10 | `/onboarding/configure-ai` | P3 | default, ingestion-pending, ingestion-success, error | `<PromptTemplateSelector>`, `<KnowledgeUploader>` | — | P1 |
| 11 | `/onboarding/invite-team` | P3 | default, sending, sent, partial-failure | `<InviteForm>`, `<InviteList>` | — | P1 |
| 12 | `/onboarding/done` | P3, P4 | default | `<OnboardingDone>`, `<NextStepsChecklist>` | — | P0 |
| 13 | `/onboarding` (router resolve) | todos | redirect-by-state | — | — | P0 |

## C. App tenant — Inbox (3 telas + estados)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 14 | `/app/inbox` | P1, P3, P4 | default, empty (1ª conversa), loading, offline (banner), filter-no-results | `<ConversationList>`, `<FilterTabs>`, `<EmptyInbox>` | sim | P0 |
| 15 | `/app/inbox/[conversationId]` | idem | default, loading thread, message-failed, contact-anonymized, blocked-contact, no-permission | `<ChatThread>`, `<ComposerBar>`, `<CRMSidePanel>`, `<HandoffBanner>`, `<SentimentBadge>`, `<MessageBubble[type]>` | sim (thread + presence) | P0 |
| — | (sub-state) Composer | — | composing, sending, send-failed, attachments-uploading, voice-recording (P2) | `<ComposerBar>` | — | P0 |

## D. App tenant — Pipelines (6 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 16 | `/app/pipelines` | P3, P4 (manager+) | default, empty (só pipeline default seedado) | `<PipelineList>` | — | P1 |
| 17 | `/app/pipelines/[pipelineId]` | P1, P3, P4 | default, empty (sem leads), loading, drag-conflict, bulk-mode | `<KanbanBoard>`, `<KanbanColumn>`, `<KanbanCard>`, `<BulkActionBar>` | sim | P0 |
| 18 | `/app/pipelines/[pipelineId]/settings` | manager+ | default, edit-vocabulary, save-error | `<PipelineSettingsForm>` | — | P1 |
| 19 | `/app/pipelines/[pipelineId]/stages` | manager+ | default, drag-reorder, has-leads-cannot-delete | `<StagesEditor>` | — | P1 |
| 20 | `/app/pipelines/[pipelineId]/custom-fields` | manager+ | default, schema-conflict, max-fields (30) | `<CustomFieldsEditor>` | — | P1 |
| 21 | `/app/pipelines/new` | manager+ | default, name-conflict | `<NewPipelineWizard>` | — | P1 |

## E. App tenant — Contacts (8 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 22 | `/app/contacts` | P1, P3, P4 | default, empty, loading, filter-no-results | `<ContactList>`, `<FilterBar>` | — | P1 |
| 23 | `/app/contacts/[id]` | idem | default, loading, anonymized, blocked, merged-tombstone | `<ContactHeader>`, `<Customer360Panel>` | sim | P0 |
| 24 | `/app/contacts/[id]/timeline` | idem | default, empty, loading-more, filter | `<TimelineView>`, `<ActivityCard[type]>` | sim | P0 |
| 25 | `/app/contacts/[id]/orders` | idem | default, empty, error-fetching | `<OrdersTable>` | — | P1 |
| 26 | `/app/contacts/[id]/conversations` | idem | default, empty | `<ConversationsList>` | — | P1 |
| 27 | `/app/contacts/[id]/consent` | manager+ | default, edit-mode, audit-history | `<ConsentMatrix>` | — | P1 |
| 28 | `/app/contacts/merge-queue` | manager+, P2 | default, empty, processing-batch | `<MergeQueueList>` | sim | P1 |
| 29 | `/app/contacts/merge-queue/[mergeId]` | manager+, P2 | default, side-by-side-diff, conflict-resolved, irreversible-confirm | `<MergeDiffView>`, `<MergeConfirmDialog>` | — | P1 |

## F. App tenant — Orders (2 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 30 | `/app/orders` | P1, P3, P4 | default, empty, sync-pending | `<OrdersTable>`, `<NuvemshopBadge>` | — | P1 |
| 31 | `/app/orders/[id]` | idem | default, loading, payload-stale | `<OrderDetail>`, `<OrderTimeline>` | — | P1 |

## G. App tenant — IA (10 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 32 | `/app/ai/agents` | P3 admin | default, empty (1 default), inactive | `<AgentsList>` | — | P1 |
| 33 | `/app/ai/agents/[id]` | P3 admin | default, edit-mode, save-error, diff-vs-prod | `<AgentEditor>`, `<SystemPromptEditor>`, `<GuardrailsEditor>` | — | P1 |
| 34 | `/app/ai/agents/new` | P3 admin | default, validation-error | `<AgentWizard>` | — | P2 |
| 35 | `/app/ai/knowledge` | manager+ | default, source-counts | `<KnowledgeOverview>` | — | P1 |
| 36 | `/app/ai/knowledge/sources` | manager+ | default, indexing, indexing-failed | `<SourcesList>` | sim (status) | P1 |
| 37 | `/app/ai/knowledge/sources/faq` | manager+ | default, edit, version-history | `<FAQEditor>`, `<VersionTimeline>` | — | P1 |
| 38 | `/app/ai/knowledge/sources/policies` | manager+ | default, uploading, parse-failed | `<PolicyUploader>` | — | P1 |
| 39 | `/app/ai/knowledge/sources/catalog` | manager+ | default, sync-paused, sync-active | `<CatalogSyncStatus>` | sim | P1 |
| 40 | `/app/ai/knowledge/sources/conversations` | manager+ | default, opt-in-required, anonymization-pending | `<ConversationsRAGSelector>` | — | P1 |
| 41 | `/app/ai/usage` | P3 admin | default, near-budget (80%), over-budget | `<UsageDashboard>`, `<CostChart>` | sim | P1 |
| 42 | `/app/ai/budget` | P3 admin | default, edit, save-error | `<BudgetForm>` | — | P1 |

## H. App tenant — Integrações (10 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 43 | `/app/integrations` | P3 admin | default, all-disconnected (warning) | `<IntegrationCards>` | — | P0 |
| 44 | `/app/integrations/whatsapp` | P3 admin | default, no-sessions, all-failed | `<SessionsList>` | sim | P0 |
| 45 | `/app/integrations/whatsapp/[id]` | P3 admin | working, scan-qr, stopped, failed, banned (suspeita) | `<SessionDetail>`, `<SessionMetrics>` | sim | P0 |
| 46 | `/app/integrations/whatsapp/[id]/qr` | P3 admin | qr-loading, scan-qr, expired, connected | `<QRCodePanel>` | sim (polling) | P0 |
| 47 | `/app/integrations/whatsapp/new` | P3 admin | name-input, creating, qr-ready | `<NewSessionWizard>` | — | P0 |
| 48 | `/app/integrations/nuvemshop` | P3 admin | connected, token-expired, no-permission, disconnected | `<NuvemshopStatus>` | — | P0 |
| 49 | `/app/integrations/nuvemshop/connect` | P3 admin | redirecting, callback-success, callback-error | `<OAuthFlow>` | — | P0 |
| 50 | `/app/integrations/nuvemshop/sync` | P3 admin | idle, in-progress (com %), completed, failed | `<SyncProgressPanel>` | sim | P1 |
| 51 | `/app/integrations/nuvemshop/webhooks` | P3 admin | default, dead-letter-items, retry-pending | `<WebhookEventsTable>`, `<DeadLetterList>` | — | P1 |
| 52 | `/app/integrations/nuvemshop/mapping` | P3 admin | default, edit, save-conflict | `<StageMappingEditor>` | — | P1 |

## I. App tenant — Team (3 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 53 | `/app/team` | P3 admin | default, empty (só admin), pending-invites | `<TeamList>`, `<PresenceDot>` | sim | P1 |
| 54 | `/app/team/invite` | P3 admin | default, sending, partial-failure | `<InviteForm>` | — | P1 |
| 55 | `/app/team/[userId]` | P3 admin | default, can-revoke, last-admin-cannot-remove | `<UserDetail>` | — | P2 |

## J. App tenant — Audit (2 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 56 | `/app/audit` | P3 admin | default, empty, filter-applied, csv-exporting | `<AuditTable>`, `<AuditFilters>` | — | P1 |
| 57 | `/app/audit/[id]` | P3 admin | default, redacted-fields, raw-payload | `<AuditEntryDetail>` | — | P1 |

## K. App tenant — LGPD (5 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 58 | `/app/lgpd` | P3 admin | default, no-pending, alarm-d+5 | `<LGPDOverview>` | — | P0 |
| 59 | `/app/lgpd/requests` | P3 admin | default, empty, filter (status) | `<LGPDRequestList>` | sim | P0 |
| 60 | `/app/lgpd/requests/[id]` | P3 admin | received, processing, completed, failed, expired | `<LGPDRequestDetail>`, `<ExportPreview>`, `<SLATimeline>` | sim | P0 |
| 61 | `/app/lgpd/redact` | P3 admin | default, search-contact, confirm-irreversible, processing | `<RedactWizard>` | — | P0 |
| 62 | `/app/lgpd/consent` | P3 admin | default, audit-trail | `<ConsentDashboard>` | — | P1 |

## L. App tenant — Settings (10 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 63 | `/app/settings/profile` | todos | default, save-success, save-error | `<ProfileForm>` | — | P0 |
| 64 | `/app/settings/notifications` | todos | default, push-permission-denied | `<NotificationsForm>` | — | P1 |
| 65 | `/app/settings/security` | todos | default | `<SecurityOverview>` | — | P0 |
| 66 | `/app/settings/security/mfa` | todos | enabled, disabled, regenerate-codes | `<MFASettings>` | — | P0 |
| 67 | `/app/settings/security/sessions` | todos | default, revoke-confirm | `<ActiveSessionsList>` | — | P1 |
| 68 | `/app/settings/tenant` | P3 admin | default, edit | `<TenantSettingsForm>` | — | P1 |
| 69 | `/app/settings/tenant/vocabulary` | manager+ | default, edit, propagating | `<VocabularyEditor>` | — | P1 |
| 70 | `/app/settings/tenant/branding` | P3 admin | default, upload-logo | `<BrandingForm>` | — | P2 |
| 71 | `/app/settings/api-tokens` | P3 admin | default, create-once-shown, revoked | `<APITokensList>`, `<TokenRevealDialog>` | — | P1 |
| 72 | `/app/settings/billing` | P3 admin | default (Fase 2) | `<BillingDashboard>` | — | P2 |

## M. Super-admin (`/admin`) (15 telas)

| # | Path | Persona | Estados | Componentes | RT | Prio |
|---|---|---|---|---|---|---|
| 73 | `/admin/dashboard` | P2 | default, alerts-active, all-healthy | `<KPICards>`, `<AlertsBanner>`, `<TopTenantsTable>` | sim | P0 |
| 74 | `/admin/inbox` | P2 | default, cross-tenant-loaded, filter-by-tenant | `<ConversationList cross-tenant>`, `<TenantBadge>` | sim | P0 |
| 75 | `/admin/inbox/[conversationId]` | P2 | default + impersonate-banner | idem D15 + `<PlatformAdminBanner>` | sim | P0 |
| 76 | `/admin/tenants` | P2 | default, search, filter-status | `<TenantsTable>` | sim | P0 |
| 77 | `/admin/tenants/new` | P2 | default, cnpj-conflict, success | `<NewTenantWizard>` | — | P0 |
| 78 | `/admin/tenants/[id]` | P2 | default | `<TenantOverview>`, `<ImpersonateButton>` | sim | P0 |
| 79 | `/admin/tenants/[id]/health` | P2 | all-healthy, waha-down, nuvemshop-token-expired, ai-budget-exhausted, audit-lag | `<HealthGrid>`, `<HealthCard>` | sim | P0 |
| 80 | `/admin/tenants/[id]/team` | P2 | default | `<TeamPresence cross-tenant>` | sim | P1 |
| 81 | `/admin/tenants/[id]/usage` | P2 | default, near-platform-cap | `<TenantUsageDashboard>` | — | P1 |
| 82 | `/admin/audit` | P2 | default, cross-tenant-filter | `<AuditTable cross-tenant>` | — | P0 |
| 83 | `/admin/lgpd/requests` | P2 | default, sla-at-risk (D+5/D+10) | `<LGPDRequestList cross-tenant>` | sim | P0 |
| 84 | `/admin/lgpd/requests/[id]` | P2 | idem K60 com badge cross-tenant | idem K60 | sim | P0 |
| 85 | `/admin/incidents` | P2 | default, active-incidents, resolved | `<IncidentsList>` | sim | P1 |
| 86 | `/admin/incidents/[id]` | P2 | default, post-mortem | `<IncidentDetail>` | — | P1 |
| 87 | `/admin/usage` | P2 | default, top-consumers | `<PlatformUsage>` | — | P1 |
| 88 | `/admin/users` | P2 | default, search | `<UsersTable cross-tenant>` | — | P1 |
| 89 | `/admin/platform-admins` | P2 | default (read-only) | `<PlatformAdminsList>` | — | P2 |

## N. Telas de erro globais (5)

| # | Path | Estados | Componentes | Prio |
|---|---|---|---|---|
| 90 | `/_not-found` | default | `<NotFound>` | P0 |
| 91 | `/_error` (500) | default, with-request-id | `<ServerError>` | P0 |
| 92 | `/403` | default | `<Forbidden>` | P0 |
| 93 | `/503` | default + status page link | `<ServiceDown>` | P1 |
| 94 | `/maintenance` | default | `<Maintenance>` | P2 |

## Resumo

- **Total de telas únicas**: ~74 (algumas têm sub-states relevantes mas mesma rota)
- **P0 (semana 1–4)**: ~32 telas
- **P1 (semana 5–8)**: ~30 telas
- **P2 (Fase 1.5+)**: ~12 telas
- **Realtime obrigatório**: ~22 telas
- **Cross-tenant (super-admin)**: 17 telas
