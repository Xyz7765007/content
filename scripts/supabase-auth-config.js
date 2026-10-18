#!/usr/bin/env node
// Applies Huesy's auth configuration to the Supabase project through the
// Management API: site URL, redirect allow list, and the Google provider.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... \
//   GOOGLE_CLIENT_ID=....apps.googleusercontent.com GOOGLE_CLIENT_SECRET=... \
//   node scripts/supabase-auth-config.js
//
// The access token is a PERSONAL token from supabase.com/dashboard/account/tokens.
// It is not one of the project keys, and it is only needed for this step. Leave
// the two Google variables out to set the URLs alone.

const REF = process.env.SUPABASE_PROJECT_ID || "jkbwjciulqzzteviqpoq";
const SITE = process.env.HUESY_SITE_URL || "https://content-engine-two-pink.vercel.app";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required (personal token, starts with sbp_)");
  process.exit(1);
}

// Every place a sign in, confirmation or recovery link may land. The wildcard
// covers Vercel preview deployments on the Huesy project.
const REDIRECTS = [
  `${SITE}/auth/callback`,
  `${SITE}/**`,
  "https://*-xyzs-projects-03235428.vercel.app/auth/callback",
  "http://localhost:3000/auth/callback",
  "http://localhost:4311/auth/callback",
];

const body = {
  site_url: SITE,
  uri_allow_list: REDIRECTS.join(","),
  external_email_enabled: true,
  mailer_autoconfirm: false,
};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  body.external_google_enabled = true;
  body.external_google_client_id = process.env.GOOGLE_CLIENT_ID;
  body.external_google_secret = process.env.GOOGLE_CLIENT_SECRET;
}

(async () => {
  const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
  const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

  const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    console.error(`PATCH failed ${res.status}: ${text.slice(0, 400)}`);
    process.exit(2);
  }

  const check = await fetch(url, { headers }).then((r) => r.json());
  console.log("site_url            :", check.site_url);
  console.log("redirect allow list :", check.uri_allow_list);
  console.log("google enabled      :", check.external_google_enabled);
  console.log("email enabled       :", check.external_email_enabled);
  console.log("done");
})();
