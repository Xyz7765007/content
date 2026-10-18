import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, getSupabaseServer } from "../../lib/supabase/server";
import { isAllowedEmail } from "../../lib/access-rules";
import { AuthShell } from "../../components/auth/AuthShell";
import LogoutButton from "../../components/auth/LogoutButton";

export const metadata = { title: "You're on the list" };
export const dynamic = "force-dynamic";

// Where a signed in account without early access lands. Their email joins the
// waitlist (once), so signing up early still counts as joining.
export default async function OnTheListPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/?join=1");
  if (isAllowedEmail(user.email)) redirect("/home");

  const admin = getSupabaseAdmin();
  if (admin && user.email) {
    const { error } = await admin.from("waitlist").insert({ email: user.email.toLowerCase(), source: "account" });
    if (error && error.code !== "23505") console.error("[huesy:waitlist] account", error.message);
  }

  return (
    <AuthShell
      title="You’re on the list"
      mood="idle"
      sub={`Huesy is opening a few accounts at a time. When yours is ready we'll email ${user.email}, and everything will be waiting here.`}
    >
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="inline-flex h-10 w-full items-center justify-center rounded-full border border-line bg-surface text-sm font-medium text-ink transition-[transform,border-color] hover:border-line-strong active:scale-[0.97]"
        >
          Back to the website
        </Link>
        <LogoutButton variant="ghost" className="w-full" size="md" />
      </div>
    </AuthShell>
  );
}
