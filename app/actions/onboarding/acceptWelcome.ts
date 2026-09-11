"use server";

/**
 * Server Action: completes the welcome step. Updates `display_name`/`timezone`
 * on the org and stamps `onboarding_state.welcome` with accepted_at + meta.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { welcomeSchema } from "@/lib/schemas/onboarding";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

export type AcceptWelcomeResult =
  | { ok: true }
  | { ok: false; error: "auth_required" | "no_active_org" | "invalid_input" | "db_error"; details?: unknown };

export async function acceptWelcome(formData: FormData): Promise<AcceptWelcomeResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code as never };
    throw err;
  }

  const raw = {
    display_name: String(formData.get("display_name") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"),
    accepted_terms_at: new Date().toISOString(),
  };

  let input;
  try {
    input = welcomeSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "invalid_input", details: err.flatten() };
    }
    throw err;
  }

  try {
    await patchOnboardingState(
      ctx.orgId,
      {
        welcome: {
          accepted_at: input.accepted_terms_at ?? new Date().toISOString(),
          timezone: input.timezone,
          display_name: input.display_name,
        },
      },
      { display_name: input.display_name, timezone: input.timezone },
    );
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: "db_error", details: err.message };
    throw err;
  }

  await audit({
    action: "onboarding.welcome_completed",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "organization",
    resourceId: ctx.orgId,
    metadata: { display_name: input.display_name, timezone: input.timezone },
  });

  redirect("/onboarding/connect-whatsapp");
}
