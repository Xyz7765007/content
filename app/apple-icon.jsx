import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Huesy on cream, for home screens.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FCF5EF" }}>
        <div
          style={{
            width: 132,
            height: 128,
            borderRadius: "48% 52% 46% 54% / 55% 50% 50% 45%",
            backgroundImage: "radial-gradient(circle at 34% 28%, #FFE8EE 0%, #FFC2D1 45%, #D3E5EF 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            paddingBottom: 18,
          }}
        >
          <div style={{ width: 15, height: 21, borderRadius: 999, background: "#141414" }} />
          <div style={{ width: 15, height: 21, borderRadius: 999, background: "#141414" }} />
        </div>
      </div>
    ),
    size
  );
}
