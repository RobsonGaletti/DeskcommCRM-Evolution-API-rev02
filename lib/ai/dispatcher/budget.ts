/**
 * Tenant budget guard for the agent-dispatcher (S-13.07).
 *
 * Reuses the EPIC-06 `ai_budgets` row — `is_throttled` or `is_disabled` both
 * count as exhausted. The full snapshot is exposed for the Sentry warn payload
 * so operators can correlate the alarm with the consumed/limit values without
 * running a follow-up query.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface TenantBudgetCheck {
  ok: boolean;
  is_throttled: boolean;
  is_disabled: boolean;
  monthly_limit_cents: number;
  current_month_consumed_cents: number;
}

export async function checkTenantBudget(orgId: string): Promise<TenantBudgetCheck> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_budgets")
    .select(
      "is_throttled, is_disabled, monthly_limit_cents, current_month_consumed_cents",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) {
    // No budget row — feature defaults to "no enforcement" so the bot can still
    // run for orgs that have not opted into spend caps yet.
    return {
      ok: true,
      is_throttled: false,
      is_disabled: false,
      monthly_limit_cents: 0,
      current_month_consumed_cents: 0,
    };
  }

  const blocked = Boolean(data.is_throttled) || Boolean(data.is_disabled);
  return {
    ok: !blocked,
    is_throttled: Boolean(data.is_throttled),
    is_disabled: Boolean(data.is_disabled),
    monthly_limit_cents: Number(data.monthly_limit_cents ?? 0),
    current_month_consumed_cents: Number(data.current_month_consumed_cents ?? 0),
  };
}
