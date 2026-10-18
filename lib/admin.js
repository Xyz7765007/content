import { requireAccess } from "./ai/access";
import { fail } from "./ai/errors";

// The owner's console is open to the addresses in ADMIN_EMAILS only.
export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email) => adminEmails().includes(String(email || "").toLowerCase());

export async function requireAdmin() {
  const { user } = await requireAccess();
  if (!user || !isAdminEmail(user.email)) throw fail("not_found", 404);
  return user;
}
