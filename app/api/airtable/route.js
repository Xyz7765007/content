import { NextResponse } from "next/server";

const AT = "https://api.airtable.com/v0";
const TBL_NAME = "Brand Profiles";

const REQUIRED_FIELDS = [
  { name: "Brand Name", type: "singleLineText" },
  { name: "Product", type: "singleLineText" },
  { name: "Description", type: "multilineText" },
  { name: "Target Audience", type: "multilineText" },
  { name: "Brand Persona", type: "multilineText" },
  { name: "Brand Values", type: "singleLineText" },
  { name: "Creative Direction", type: "multilineText" },
  { name: "Instagram Personality", type: "multilineText" },
  { name: "LinkedIn Personality", type: "multilineText" },
  { name: "Twitter Personality", type: "multilineText" },
  { name: "Email Personality", type: "multilineText" },
  { name: "LinkedIn Refs", type: "multilineText" },
  { name: "Twitter Refs", type: "multilineText" },
  { name: "Email Refs", type: "multilineText" },
  { name: "Extra JSON", type: "multilineText" },
];

async function atReq(path, key, opts = {}) {
  const url = path.startsWith("http") ? path : `${AT}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = body?.error?.message || body?.error || `Airtable error ${r.status}`;
    throw new Error(typeof msg === "object" ? JSON.stringify(msg) : msg);
  }
  return body;
}

async function findTable(base, key) {
  const schema = await atReq(`/meta/bases/${base}/tables`, key);
  return (schema.tables || []).find((t) => t.name === TBL_NAME) || null;
}

async function createTable(base, key) {
  return atReq(`/meta/bases/${base}/tables`, key, {
    method: "POST",
    body: JSON.stringify({ name: TBL_NAME, description: "Brand profiles for Content Engine", fields: REQUIRED_FIELDS }),
  });
}

async function addMissingFields(base, key, tableId, existingFields) {
  const have = new Set(existingFields.map((f) => f.name));
  for (const f of REQUIRED_FIELDS) {
    if (!have.has(f.name)) {
      try {
        await atReq(`/meta/bases/${base}/tables/${tableId}/fields`, key, {
          method: "POST", body: JSON.stringify({ name: f.name, type: f.type }),
        });
      } catch {}
    }
  }
}

async function ensureTable(base, key) {
  let table = await findTable(base, key);
  if (!table) { table = await createTable(base, key); return table.id; }
  await addMissingFields(base, key, table.id, table.fields || []);
  return table.id;
}

function buildFields(data) {
  return {
    "Brand Name": data.brandName || "",
    Product: data.product || "",
    Description: data.brandDescription || "",
    "Target Audience": data.targetAudience || "",
    "Brand Persona": data.brandPersona || "",
    "Brand Values": data.brandValues || "",
    "Creative Direction": data.creativeDirection || "",
    "Instagram Personality": data.platformPersonality?.instagram || "",
    "LinkedIn Personality": data.platformPersonality?.linkedin || "",
    "Twitter Personality": data.platformPersonality?.twitter || "",
    "Email Personality": data.platformPersonality?.email || "",
    "LinkedIn Refs": safeStr(data.referencePosts?.linkedin || []),
    "Twitter Refs": safeStr(data.referencePosts?.twitter || []),
    "Email Refs": safeStr(data.referencePosts?.email || []),
  };
}

function safeStr(v) { try { return JSON.stringify(v); } catch { return "[]"; } }
function safeParse(s, fb) { if (!s) return fb; try { return JSON.parse(s); } catch { return fb; } }

function toRecord(r) {
  const f = r.fields || {};
  return {
    rid: r.id, brandName: f["Brand Name"] || "", product: f["Product"] || "",
    brandDescription: f["Description"] || "", targetAudience: f["Target Audience"] || "",
    brandPersona: f["Brand Persona"] || "", brandValues: f["Brand Values"] || "",
    creativeDirection: f["Creative Direction"] || "",
    platformPersonality: {
      instagram: f["Instagram Personality"] || "", linkedin: f["LinkedIn Personality"] || "",
      twitter: f["Twitter Personality"] || "", email: f["Email Personality"] || "",
    },
    referencePosts: {
      linkedin: safeParse(f["LinkedIn Refs"], []),
      twitter: safeParse(f["Twitter Refs"], []),
      email: safeParse(f["Email Refs"], []),
    },
  };
}

export async function POST(req) {
  try {
    const { action, data, recordId } = await req.json();
    const key = process.env.AIRTABLE_PAT;
    const base = process.env.AIRTABLE_BASE_ID;
    if (!key) return NextResponse.json({ error: "AIRTABLE_PAT not set in env vars" }, { status: 500 });
    if (!base) return NextResponse.json({ error: "AIRTABLE_BASE_ID not set in env vars" }, { status: 500 });

    if (action === "test") {
      const tid = await ensureTable(base, key);
      return NextResponse.json({ ok: true, message: `Table "${TBL_NAME}" ready (${tid}). ${REQUIRED_FIELDS.length} fields.` });
    }

    if (action === "load") {
      await ensureTable(base, key);
      let result;
      try { result = await atReq(`/${base}/${encodeURIComponent(TBL_NAME)}?sort%5B0%5D%5Bfield%5D=Brand+Name&sort%5B0%5D%5Bdirection%5D=asc`, key); }
      catch { result = await atReq(`/${base}/${encodeURIComponent(TBL_NAME)}`, key); }
      return NextResponse.json({ brands: (result.records || []).map(toRecord).filter((b) => b.brandName) });
    }

    if (action === "save") {
      if (!data) return NextResponse.json({ error: "No data" }, { status: 400 });
      await ensureTable(base, key);
      const fields = buildFields(data);
      let result;
      if (recordId) { result = await atReq(`/${base}/${encodeURIComponent(TBL_NAME)}/${recordId}`, key, { method: "PATCH", body: JSON.stringify({ fields }) }); }
      else { result = await atReq(`/${base}/${encodeURIComponent(TBL_NAME)}`, key, { method: "POST", body: JSON.stringify({ fields }) }); }
      return NextResponse.json({ id: result.id });
    }

    if (action === "delete") {
      if (!recordId) return NextResponse.json({ error: "No recordId" }, { status: 400 });
      await atReq(`/${base}/${encodeURIComponent(TBL_NAME)}/${recordId}`, key, { method: "DELETE" });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
