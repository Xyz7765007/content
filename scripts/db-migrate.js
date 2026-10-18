#!/usr/bin/env node
// Applies supabase/schema.sql to the project database.
//
//   SUPABASE_DB_PASSWORD=... node scripts/db-migrate.js
//
// Tries the direct host first, then the connection poolers region by region,
// because the direct host is IPv6 only on newer projects and many networks
// cannot reach it.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const REF = process.env.SUPABASE_PROJECT_ID || "jkbwjciulqzzteviqpoq";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD is required");
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "schema.sql"), "utf8");

const REGIONS = [
  "ap-south-1", "ap-southeast-1", "us-east-1", "us-west-1", "eu-central-1", "eu-west-1",
  "eu-west-2", "ap-northeast-1", "ap-southeast-2", "sa-east-1", "ca-central-1", "us-east-2",
  "eu-north-1", "ap-northeast-2", "us-west-2",
];

const candidates = [
  { host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
  ...REGIONS.map((r) => ({ host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}` })),
  ...REGIONS.map((r) => ({ host: `aws-1-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}` })),
];

(async () => {
  for (const c of candidates) {
    const client = new Client({
      host: c.host, port: c.port, user: c.user, password: PASSWORD, database: "postgres",
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      console.log(`connected via ${c.host}`);
      await client.query(sql);
      const { rows } = await client.query(
        "select table_name from information_schema.tables where table_schema='public' and table_name in ('user_state','waitlist','contact_messages') order by 1"
      );
      console.log("tables:", rows.map((r) => r.table_name).join(", "));
      await client.end();
      process.exit(0);
    } catch (e) {
      const msg = String(e.message || e).split("\n")[0];
      if (/password|authentication/i.test(msg)) { console.error(`auth failed at ${c.host}: ${msg}`); process.exit(2); }
      // unreachable host or wrong region: try the next
      try { await client.end(); } catch {}
    }
  }
  console.error("could not reach the database on any known host");
  process.exit(3);
})();
