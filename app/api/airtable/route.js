import { NextResponse } from "next/server";

const AT = "https://api.airtable.com/v0";
const TBL = "Brand Profiles";

async function atReq(path, key, opts = {}) {
  const r = await fetch(`${AT}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message || `Airtable ${r.status}`);
  }
  return r.json();
}

async function ensureTable(base, key) {
  try {
    await atReq(`/${base}/${encodeURIComponent(TBL)}?maxRecords=1`, key);
    return;
  } catch {}

  await atReq(`/meta/bases/${base}/tables`, key, {
    method: "POST",
    body: JSON.stringify({
      name: TBL,
      fields: [
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
      ],
    }),
  });
}

export async function POST(req) {
  try {
    const { action, data, recordId } = await req.json();
    const key = process.env.AIRTABLE_PAT;
    const base = process.env.AIRTABLE_BASE_ID;

    if (!key || !base) {
      return NextResponse.json({ error: "Airtable credentials not configured" }, { status: 500 });
    }

    if (action === "test") {
      await ensureTable(base, key);
      return NextResponse.json({ ok: true });
    }

    if (action === "load") {
      await ensureTable(base, key);
      const result = await atReq(
        `/${base}/${encodeURIComponent(TBL)}?sort%5B0%5D%5Bfield%5D=Brand+Name`,
        key
      );
      const brands = (result.records || []).map((r) => {
        const f = r.fields;
        let refs = {};
        try { refs.linkedin = JSON.parse(f["LinkedIn Refs"] || "[]"); } catch { refs.linkedin = []; }
        try { refs.twitter = JSON.parse(f["Twitter Refs"] || "[]"); } catch { refs.twitter = []; }
        try { refs.email = JSON.parse(f["Email Refs"] || "[]"); } catch { refs.email = []; }

        return {
          rid: r.id,
          brandName: f["Brand Name"] || "",
          product: f["Product"] || "",
          brandDescription: f["Description"] || "",
          targetAudience: f["Target Audience"] || "",
          brandPersona: f["Brand Persona"] || "",
          brandValues: f["Brand Values"] || "",
          creativeDirection: f["Creative Direction"] || "",
          platformPersonality: {
            instagram: f["Instagram Personality"] || "",
            linkedin: f["LinkedIn Personality"] || "",
            twitter: f["Twitter Personality"] || "",
            email: f["Email Personality"] || "",
          },
          referencePosts: refs,
        };
      });
      return NextResponse.json({ brands });
    }

    if (action === "save") {
      await ensureTable(base, key);
      const fields = {
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
        "LinkedIn Refs": JSON.stringify(data.referencePosts?.linkedin || []),
        "Twitter Refs": JSON.stringify(data.referencePosts?.twitter || []),
        "Email Refs": JSON.stringify(data.referencePosts?.email || []),
      };

      let result;
      if (recordId) {
        result = await atReq(
          `/${base}/${encodeURIComponent(TBL)}/${recordId}`,
          key,
          { method: "PATCH", body: JSON.stringify({ fields }) }
        );
      } else {
        result = await atReq(
          `/${base}/${encodeURIComponent(TBL)}`,
          key,
          { method: "POST", body: JSON.stringify({ fields }) }
        );
      }
      return NextResponse.json({ id: result.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
