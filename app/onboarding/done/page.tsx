import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { DoneClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function DonePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const { state } = await loadOnboardingState(activeOrg.orgId);

  return (
    <DoneClient
      recap={{
        welcome: Boolean(state.welcome),
        whatsapp: Boolean(state.whatsapp) && !state.whatsapp?.skipped,
        nuvemshop: Boolean(state.nuvemshop) && !state.nuvemshop?.skipped,
        ai: Boolean(state.ai) && !state.ai?.skipped,
        team: Boolean(state.team) && !state.team?.skipped,
      }}
    />
  );
}
