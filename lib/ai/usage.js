import { getSupabaseAdmin } from "../supabase/server";
import { estimateUsd } from "./models";

// A row per model call in ai_usage: who, what kind of job, which model, the
// tokens and the estimated dollars. It is the cost ledger, and it backs the
// per person daily allowance (HUESY_DAILY_USD_CAP, default $3).

const dailyCap = () => {
  const n = Number(process.env.HUESY_DAILY_USD_CAP);
  return Number.isFinite(n) && n > 0 ? n : 3;
};

export async function recordUsage({ userId, kind, model, usage, mock = false }) {
  const usd = mock ? 0 : estimateUsd(model, usage);
  const row = {
    user_id: userId || null,
    kind,
    model,
    input_tokens: usage?.input_tokens || 0,
    output_tokens: usage?.output_tokens || 0,
    cache_read_tokens: usage?.cache_read_input_tokens || 0,
    cache_write_tokens: usage?.cache_creation_input_tokens || 0,
    web_searches: usage?.server_tool_use?.web_search_requests || 0,
    usd: Number(usd.toFixed(5)),
    mock,
  };
  console.log("[huesy:usage]", JSON.stringify(row));
  const admin = getSupabaseAdmin();
  if (!admin) return usd;
  const { error } = await admin.from("ai_usage").insert(row);
  if (error) console.error("[huesy:usage] insert failed", error.message);
  return usd;
}

// Spend that isn't model tokens: data calls and images. Same ledger, so the
// daily backstop and the admin's cost view see everything.
export async function recordSpend({ userId, kind, model, usd = 0, mock = false }) {
  const row = { user_id: userId && userId !== "local" ? userId : null, kind, model, usd: Number((mock ? 0 : usd).toFixed(5)), mock };
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from("ai_usage").insert(row);
  if (error) console.error("[huesy:usage] spend insert failed", error.message);
}

// Today's spend for one person, in USD, summed in the database (so a busy
// day is never undercounted). Fails open: if the ledger can't be read, the
// request goes ahead rather than blocking someone on our fault.
export async function overDailyCap(userId) {
  const admin = getSupabaseAdmin();
  if (!admin || !userId) return false;
  const { data, error } = await admin.rpc("spend_today", { p_user: userId });
  if (error) {
    console.error("[huesy:usage] read failed", error.message);
    return false;
  }
  return Number(data || 0) >= dailyCap();
}
