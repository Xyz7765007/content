import { getSupabaseAdmin } from "../supabase/server";
import { isSupabaseConfigured } from "../supabase/env";
import { PLANS, PRICES, planById, tier2Seats } from "../plans";
import { fail } from "../ai/errors";

// A person's plan, credits and allowances. Credits and allowance claims only
// ever move through the Postgres functions in supabase/schema.sql, under a row
// lock, so parallel requests can't overspend. Server only.

// Without Supabase (local development) everyone gets a Studio account kept in
// memory, so every screen can still be built and tried.
const local = new Map();
const localAccount = (user) => {
  const id = user?.id || "local";
  if (!local.has(id)) {
    const now = Date.now();
    local.set(id, {
      user_id: id,
      email: user?.email || "local@huesy.dev",
      plan: "tier2",
      credits: PLANS.tier2.credits,
      period_start: new Date(now).toISOString(),
      period_end: new Date(now + 30 * 86400000).toISOString(),
      welcome_report_used: false,
      local: true,
    });
  }
  return local.get(id);
};
const isLocal = () => !isSupabaseConfigured() || !getSupabaseAdmin();

const db = () => {
  const admin = getSupabaseAdmin();
  if (!admin) throw fail("not_connected", 503);
  return admin;
};

const pgError = (error) => String(error?.message || error || "");

// The account row, created on first use, with a new period started when the
// last one has ended. Starting a period resets credits to the plan's amount.
export async function getAccount(user) {
  if (!user) throw fail("sign_in", 401);
  if (isLocal()) return localAccount(user);
  const admin = db();
  let { data: acc, error } = await admin.from("accounts").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw fail("failed", 500);
  if (!acc) {
    const { error: insertError } = await admin
      .from("accounts")
      .insert({ user_id: user.id, email: (user.email || "").toLowerCase() });
    if (insertError && insertError.code !== "23505") throw fail("failed", 500);
    ({ data: acc } = await admin.from("accounts").select("*").eq("user_id", user.id).maybeSingle());
  }
  if (acc?.plan && (!acc.period_end || new Date(acc.period_end).getTime() <= Date.now())) {
    const { error: periodError } = await admin.rpc("start_period", {
      p_user: user.id,
      p_credits: PLANS[acc.plan]?.credits || 0,
    });
    if (periodError) console.error("[huesy:billing] start_period", pgError(periodError));
    ({ data: acc } = await admin.from("accounts").select("*").eq("user_id", user.id).maybeSingle());
  }
  return acc;
}

// Throws the right friendly error when the plan doesn't cover a feature.
export async function requirePlan(user, need = "any") {
  const acc = await getAccount(user);
  if (!acc?.plan) throw fail("no_plan", 402);
  if (need === "studio" && !planById(acc.plan)?.studio) throw fail("studio_only", 402);
  return acc;
}

// Takes an action's credits up front. Returns the new balance.
export async function spendCredits(user, action, { ref = null, meta = null, amount } = {}) {
  const price = amount ?? PRICES[action] ?? 0;
  if (price <= 0) return (await getAccount(user)).credits;
  if (isLocal()) {
    const acc = localAccount(user);
    if (acc.credits < price) throw fail("no_credits", 402);
    acc.credits -= price;
    return acc.credits;
  }
  const { data, error } = await db().rpc("spend_credits", {
    p_user: user.id,
    p_amount: price,
    p_reason: action,
    p_ref: ref,
    p_meta: meta,
  });
  if (error) {
    if (/insufficient_credits/.test(pgError(error))) throw fail("no_credits", 402);
    console.error("[huesy:billing] spend", pgError(error));
    throw fail("failed", 500);
  }
  return data;
}

// Gives credits back when an action fails or finds nothing. Never throws: a
// refund that can't be written is logged for the admin to settle.
export async function refundCredits(user, amount, reason, ref = null) {
  if (!amount || amount <= 0) return null;
  if (isLocal()) {
    const acc = localAccount(user);
    acc.credits += amount;
    return acc.credits;
  }
  const { data, error } = await db().rpc("add_credits", {
    p_user: user.id,
    p_amount: amount,
    p_reason: `refund:${reason}`,
    p_ref: ref,
  });
  if (error) {
    console.error("[huesy:billing] refund failed", user.id, amount, reason, pgError(error));
    return null;
  }
  return data;
}

export async function grantCredits(userId, amount, reason, ref = null) {
  const { data, error } = await db().rpc("add_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_ref: ref });
  if (error) throw fail("failed", 500);
  return data;
}

// Counts one studio item or reel against the month. Returns how many are now
// used, or -1 when the piece was already counted (nothing changed, so the
// caller must not release it).
export async function claimAllowance(user, kind, itemId) {
  const acc = await requirePlan(user, "studio");
  const limit = PLANS[acc.plan].allowances[kind];
  if (isLocal()) return 1;
  const { data, error } = await db().rpc("claim_allowance", {
    p_user: user.id,
    p_kind: kind,
    p_limit: limit,
    p_item: itemId,
  });
  if (error) {
    const msg = pgError(error);
    if (/allowance_used/.test(msg)) throw fail("allowance_used", 402);
    if (/no_plan/.test(msg)) throw fail("no_plan", 402);
    if (/no_item/.test(msg)) throw fail("not_found", 404);
    console.error("[huesy:billing] claim", msg);
    throw fail("failed", 500);
  }
  return data;
}

// Puts a claimed item back, when generation failed or a reel was cancelled.
export async function releaseAllowance(kind, itemId) {
  if (isLocal()) return;
  const table = kind === "reel" ? "reel_requests" : "content_items";
  const { error } = await db().from(table).update({ counted: false, counted_at: null }).eq("id", itemId);
  if (error) console.error("[huesy:billing] release", pgError(error));
}

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

// Written posts are unlimited with a daily fair-use line.
export async function textUsedToday(user) {
  if (isLocal()) return 0;
  const { count } = await db()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfUtcDay())
    .or("kind.like.write:%,kind.eq.rewrite,kind.like.text:%");
  return count || 0;
}

export async function requireTextAllowance(user) {
  const acc = await requirePlan(user, "studio");
  const used = await textUsedToday(user);
  if (used >= PLANS[acc.plan].textPerDay) throw fail("text_fair_use", 429);
  return acc;
}

export async function seatsTaken() {
  if (isLocal()) return 0;
  const { count } = await db()
    .from("accounts")
    .select("user_id", { count: "exact", head: true })
    .eq("plan", "tier2");
  return count || 0;
}

async function allowanceUse(userId, since) {
  if (isLocal() || !since) return { creative: 0, carousel: 0, reel: 0 };
  const admin = db();
  const count = async (table, kind) => {
    let q = admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("counted", true)
      .gte("counted_at", since);
    if (kind) q = q.eq("kind", kind);
    const { count: n } = await q;
    return n || 0;
  };
  const [creative, carousel, reel] = await Promise.all([
    count("content_items", "creative"),
    count("content_items", "carousel"),
    count("reel_requests"),
  ]);
  return { creative, carousel, reel };
}

// How many of a studio kind are left this month, checked before planning one
// so nobody shapes a piece they can't create.
export async function allowanceLeft(user, kind) {
  const acc = await requirePlan(user, "studio");
  const limit = PLANS[acc.plan].allowances[kind];
  const used = (await allowanceUse(user.id, acc.period_start))[kind] || 0;
  return { limit, used, left: Math.max(0, limit - used), resetsAt: acc.period_end };
}

// Everything the screens need to show the plan, in one object.
export async function accountSummary(user) {
  const acc = await getAccount(user);
  const plan = planById(acc.plan);
  const [used, textToday, taken, request] = await Promise.all([
    allowanceUse(user.id, acc.period_start),
    plan?.studio ? textUsedToday(user) : Promise.resolve(0),
    seatsTaken(),
    isLocal()
      ? Promise.resolve(null)
      : db()
          .from("plan_requests")
          .select("id, plan, status, created_at")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data || null),
  ]);
  const seats = tier2Seats();
  return {
    email: acc.email,
    plan: acc.plan || null,
    planName: plan?.name || null,
    studio: Boolean(plan?.studio),
    credits: acc.credits ?? 0,
    creditsPerPeriod: plan?.credits || 0,
    periodStart: acc.period_start,
    periodEnd: acc.period_end,
    welcomeReport: Boolean(acc.plan) && !acc.welcome_report_used,
    allowances: plan?.studio
      ? Object.fromEntries(
          Object.entries(plan.allowances).map(([k, limit]) => [k, { used: used[k] || 0, limit, left: Math.max(0, limit - (used[k] || 0)) }])
        )
      : null,
    text: plan?.studio ? { usedToday: textToday, perDay: plan.textPerDay } : null,
    seats: { limit: seats, taken, left: Math.max(0, seats - taken) },
    prices: PRICES,
    pendingRequest: request,
  };
}

// The first deep report is on Huesy. Marks it used; returns true if it was free.
export async function useWelcomeReport(user) {
  if (isLocal()) {
    const acc = localAccount(user);
    if (acc.welcome_report_used) return false;
    acc.welcome_report_used = true;
    return true;
  }
  const { data, error } = await db()
    .from("accounts")
    .update({ welcome_report_used: true })
    .eq("user_id", user.id)
    .eq("welcome_report_used", false)
    .not("plan", "is", null)
    .select("user_id");
  if (error) return false;
  return Boolean(data?.length);
}

export async function restoreWelcomeReport(user) {
  if (isLocal()) {
    localAccount(user).welcome_report_used = false;
    return;
  }
  await db().from("accounts").update({ welcome_report_used: false }).eq("user_id", user.id);
}

// The month's credit history, newest first, in words people read.
const LEDGER_WORDS = {
  ask: "Question",
  report: "Deep report",
  creators: "Creator search",
  radar: "Watchlist check",
  contact: "Creator contact",
  period_start: "New month",
  admin_grant: "Added by Huesy",
};
export async function creditHistory(user, limit = 40) {
  if (isLocal()) return [];
  const { data } = await db()
    .from("credit_ledger")
    .select("id, delta, balance_after, reason, created_at")
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(limit);
  return (data || []).map((r) => {
    const refund = r.reason.startsWith("refund:");
    const key = refund ? r.reason.slice(7).replace(/_no_data|_empty|_failed|_stopped/, "") : r.reason;
    return { id: r.id, delta: r.delta, balance: r.balance_after, at: r.created_at, refund, label: `${LEDGER_WORDS[key] || "Credits"}${refund ? " refunded" : ""}` };
  });
}

export async function requestPlan(user, planId, note = "") {
  if (!PLANS[planId]) throw fail("bad_request", 400);
  if (isLocal()) return { id: 0, plan: planId, status: "pending" };
  const admin = db();
  const { data: existing } = await admin
    .from("plan_requests")
    .select("id, plan, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    if (existing.plan !== planId) await admin.from("plan_requests").update({ plan: planId, note: String(note || "").slice(0, 500) }).eq("id", existing.id);
    return { ...existing, plan: planId };
  }
  const { data, error } = await admin
    .from("plan_requests")
    .insert({ user_id: user.id, email: (user.email || "").toLowerCase(), plan: planId, note: String(note || "").slice(0, 500) })
    .select("id, plan, status, created_at")
    .single();
  if (error) throw fail("failed", 500);
  return data;
}

// Admin: sets a plan. Someone without a plan starts a fresh month on next
// use. Someone switching plans keeps their month: the same dates, credits
// and what they've used (both plans carry the same credits), so a switch is
// never a free refill. The same plan again changes nothing.
export async function setPlan(userId, planId) {
  if (planId && !PLANS[planId]) throw fail("bad_request", 400);
  const admin = db();
  const { data: acc } = await admin.from("accounts").select("plan").eq("user_id", userId).maybeSingle();
  if ((acc?.plan || null) === (planId || null)) return;
  if (planId === "tier2" && (await seatsTaken()) >= tier2Seats()) throw fail("seats_full", 409);
  const patch = !planId ? { plan: null, period_start: null, period_end: null, credits: 0 } : acc?.plan ? { plan: planId } : { plan: planId, period_end: null };
  const { error } = await admin.from("accounts").update(patch).eq("user_id", userId);
  if (error) throw fail("failed", 500);
}
