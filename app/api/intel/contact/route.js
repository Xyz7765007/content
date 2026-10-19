import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { refundCredits, spendCredits } from "../../../../lib/billing/account";
import { PRICES } from "../../../../lib/plans";
import { creatorContact } from "../../../../lib/intel/tools";
import { getReport, updateReport } from "../../../../lib/intel/reports";

// A creator's contact on any platform (20 credits), refunded when none is found.
// Opened from a creator report, the contact is kept on the report, so it is
// never paid for twice.
export async function POST(req) {
  let user;
  let charged = false;
  try {
    const body = await req.json().catch(() => null);
    const handle = String(body?.handle || "").replace(/^@/, "").trim();
    if (!/^[\w.-]{2,60}$/.test(handle)) throw fail("bad_request", 400);
    ({ user } = await requireMember("any"));
    const report = body.reportId ? await getReport(user, body.reportId) : null;
    const creators = report?.body?.data?.creators || [];
    // The platform comes from the report when there is one, so it can't be spoofed.
    const fromReport = creators.find((c) => String(c.handle).toLowerCase() === handle.toLowerCase());
    const platform = fromReport?.platform || report?.body?.data?.platform || (["instagram", "tiktok", "youtube", "x", "linkedin"].includes(body?.platform) ? body.platform : "instagram");
    const url = fromReport?.url || null;
    const name = fromReport?.name || null;
    const index = creators.findIndex((c) => String(c.handle).toLowerCase() === handle.toLowerCase());
    const known = index >= 0 ? creators[index].contact : null;
    if (known) return NextResponse.json({ handle, ...known, credits: null, kept: true });

    let balance = await spendCredits(user, "contact", { ref: handle });
    charged = true;
    const contact = await creatorContact({ platform, handle, url, name }, { user });
    const found = Boolean(contact?.found && (contact.email || contact.phone));
    const result = found ? { found: true, email: contact.email || null, emails: (contact.emails || []).slice(0, 3), phone: contact.phone || null, website: contact.website || null } : { found: false, website: contact?.website || null };
    if (!found) {
      balance = (await refundCredits(user, PRICES.contact, "contact", handle)) ?? balance;
      charged = false;
    }
    if (index >= 0) {
      // Read it again just before writing, so two contacts opened at once both stay.
      const latest = (await getReport(user, report.id)) || report;
      const list = latest.body?.data?.creators || creators;
      const next = list.map((c) => (String(c.handle).toLowerCase() === handle.toLowerCase() ? { ...c, contact: result } : c));
      await updateReport(user, report.id, { body: { ...latest.body, data: { ...latest.body.data, creators: next } } });
    }
    return NextResponse.json({ handle, ...result, credits: balance, refunded: !found });
  } catch (err) {
    if (charged) await refundCredits(user, PRICES.contact, "contact");
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
