import { getSupabaseServer } from "../supabase/server";
import { isSupabaseConfigured } from "../supabase/env";
import { isAllowedEmail } from "../access-rules";
import { fail } from "./errors";
import { isMock } from "./client";
import { overDailyCap } from "./usage";

// Every route that can spend money calls this first. It needs a signed in
// account that has early access, and an allowance left for today. Without
// Supabase (local development) the routes stay usable, but never in a
// production build unless the stand-in model is on.
export async function requireAccess() {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV !== "production" || isMock()) return { user: null };
    throw fail("not_connected", 503);
  }

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw fail("sign_in", 401);
  if (!isAllowedEmail(user.email)) throw fail("waitlist", 403);
  if (!isMock() && (await overDailyCap(user.id))) throw fail("daily_limit", 429);

  return { user };
}
