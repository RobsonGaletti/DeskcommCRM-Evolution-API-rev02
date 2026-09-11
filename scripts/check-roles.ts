import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
if (!urlMatch?.[1] || !keyMatch?.[1]) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();
const sb = createClient(url, key, { auth: { persistSession: false } });
const creds = JSON.parse(fs.readFileSync(".e2e-creds.json", "utf8"));
(async () => {
  for (const u of Object.values(creds.users) as Array<{ id: string; email: string }>) {
    const { data } = await sb
      .from("user_organizations")
      .select("user_id, organization_id, role")
      .eq("user_id", u.id);
    console.log(u.email, "→", JSON.stringify(data));
  }
})();
