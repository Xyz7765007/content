import { NextResponse } from "next/server";
import { requireAccess } from "../../../lib/ai/access";
import { errorJson, fail } from "../../../lib/ai/errors";
import { accountSummary, creditHistory, requestPlan } from "../../../lib/billing/account";
import { isAdminEmail } from "../../../lib/admin";

// The plan meter: plan, credits, allowances, seats left and prices.
export async function GET(req) {
  try {
    const { user } = await requireAccess();
    const member = user || { id: "local", email: "local@huesy.dev" };
    if (new URL(req.url).searchParams.get("history")) return NextResponse.json({ history: await creditHistory(member) });
    return NextResponse.json({ ...(await accountSummary(member)), admin: isAdminEmail(user?.email) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

// Asking for a plan while payments aren't wired: the request waits for the
// admin to switch it on.
export async function POST(req) {
  try {
    const { user } = await requireAccess();
    const body = await req.json().catch(() => null);
    if (body?.action !== "request_plan") throw fail("bad_request", 400);
    const member = user || { id: "local", email: "local@huesy.dev" };
    const request = await requestPlan(member, body.plan, body.note);
    return NextResponse.json({ request, account: await accountSummary(member) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
