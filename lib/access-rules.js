// Who can use the engine while Huesy is a waitlist. Plain functions with no
// imports, so the middleware (edge runtime) and the API routes (node) read the
// same rules.
//
// HUESY_ACCESS     "waitlist" (default) or "open". Open lets every signed in
//                  account into the engine; the site stays a waitlist either way
//                  until NEXT_PUBLIC_HUESY_SITE is set to "open".
// HUESY_EARLY_ACCESS  comma separated emails or "@domain" rules: who gets in,
//                  besides the QA account. Example: "maya@brand.com,@agency.co".

const DEFAULT_EARLY_ACCESS = ["qa.huesy@example.com"];

export const accessMode = () =>
  String(process.env.HUESY_ACCESS || "waitlist").trim().toLowerCase() === "open"
    ? "open"
    : "waitlist";

const earlyAccessRules = () =>
  [...DEFAULT_EARLY_ACCESS, ...String(process.env.HUESY_EARLY_ACCESS || "").split(",")]
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);

export function isAllowedEmail(email) {
  if (accessMode() === "open") return true;
  const address = String(email || "").trim().toLowerCase();
  if (!address.includes("@")) return false;
  return earlyAccessRules().some((rule) =>
    rule.startsWith("@") ? address.endsWith(rule) : address === rule
  );
}

// The public site shows the waitlist until this is flipped. Read on the
// client too, so it has to be a NEXT_PUBLIC_ variable.
export const siteIsWaitlist = () =>
  String(process.env.NEXT_PUBLIC_HUESY_SITE || "waitlist").trim().toLowerCase() !== "open";
