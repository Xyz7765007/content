#!/usr/bin/env node
// Sets someone's plan by email, from the command line. A new plan starts a
// fresh month (credits reset) the next time they use Huesy.
//
//   SB_URL=... SB_KEY=<secret key> node scripts/admin/set-plan.mjs person@example.com tier2
//   ... node scripts/admin/set-plan.mjs person@example.com none     # removes the plan
//   ... node scripts/admin/set-plan.mjs person@example.com credits 5000   # grants credits

const [email, plan, amount] = process.argv.slice(2);
const SB = process.env.SB_URL;
const KEY = process.env.SB_KEY;
if (!SB || !KEY || !email || !plan) {
  console.error("Usage: SB_URL=... SB_KEY=... node scripts/admin/set-plan.mjs <email> <tier1|tier2|none|credits> [amount]");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function findUser() {
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${SB}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
    const j = await r.json();
    const hit = (j.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if ((j.users || []).length < 200) return null;
  }
  return null;
}

const user = await findUser();
if (!user) {
  console.error(`No account for ${email}. They need to sign up first.`);
  process.exit(1);
}

if (plan === "credits") {
  const n = Math.round(Number(amount));
  const r = await fetch(`${SB}/rest/v1/rpc/add_credits`, { method: "POST", headers: H, body: JSON.stringify({ p_user: user.id, p_amount: n, p_reason: "admin_grant" }) });
  console.log(r.ok ? `Granted ${n} credits. Balance: ${await r.text()}` : `Failed: ${await r.text()}`);
  process.exit(r.ok ? 0 : 1);
}

const row = plan === "none"
  ? { user_id: user.id, email: user.email, plan: null, credits: 0, period_start: null, period_end: null }
  : { user_id: user.id, email: user.email, plan, period_end: null };
const r = await fetch(`${SB}/rest/v1/accounts?on_conflict=user_id`, {
  method: "POST",
  headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(row),
});
console.log(r.ok ? `${user.email} is now on ${plan === "none" ? "no plan" : plan}.` : `Failed: ${await r.text()}`);
process.exit(r.ok ? 0 : 1);
