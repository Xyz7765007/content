import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Huesy: stop finding out from other people's posts";

// The link preview: Huesy, the headline, and the promise in one line.
export default async function OpenGraphImage() {
  const dir = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");
  const [medium, semibold] = await Promise.all([
    readFile(join(dir, "Geist-Medium.ttf")),
    readFile(join(dir, "Geist-SemiBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#FCF5EF",
          backgroundImage:
            "radial-gradient(circle at 12% 10%, rgba(255,194,209,0.65) 0%, rgba(255,194,209,0) 45%), radial-gradient(circle at 90% 18%, rgba(211,229,239,0.8) 0%, rgba(211,229,239,0) 45%)",
          fontFamily: "Geist",
          color: "#141414",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 62,
              borderRadius: "48% 52% 46% 54% / 55% 50% 50% 45%",
              backgroundImage: "radial-gradient(circle at 34% 28%, #FFE8EE 0%, #FFC2D1 45%, #D3E5EF 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              paddingBottom: 8,
            }}
          >
            <div style={{ width: 7, height: 10, borderRadius: 999, background: "#141414" }} />
            <div style={{ width: 7, height: 10, borderRadius: 999, background: "#141414" }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>Huesy</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.04, maxWidth: 940 }}>
            Stop finding out from other people's posts.
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, color: "#5f5852", maxWidth: 940, lineHeight: 1.35 }}>
            Launches, collabs and campaigns from Google News, Instagram and X, with the post drafted in your voice.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 500 }}>
          <div style={{ display: "flex", padding: "12px 24px", borderRadius: 999, background: "#FFC2D1", border: "1px solid #F4B3C4" }}>
            Join the waitlist
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: medium, weight: 500, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    }
  );
}
