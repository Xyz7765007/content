import { requireAccess } from "../ai/access";
import { requirePlan } from "./account";

// For every route behind a plan: signed in, invited, under the daily cost
// backstop, and on a plan that covers the feature ("any" or "studio").
// Local development without accounts runs as one local Studio user.
export async function requireMember(need = "any") {
  const { user } = await requireAccess();
  const member = user || { id: "local", email: "local@huesy.dev" };
  const account = await requirePlan(member, need);
  return { user: member, account };
}
