import { ImageResponse } from "next/og";

// Default link-preview image for every page (Next adds og:image/twitter:image automatically).
export const alt = "Splitly – dela utgifter enkelt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 32,
            background: "rgba(255,255,255,0.15)",
            fontSize: 72,
            fontWeight: 700,
            marginBottom: 48,
          }}
        >
          S
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>Splitly</div>
        <div style={{ fontSize: 40, marginTop: 16, color: "#e0e7ff" }}>
          Dela utgifter och gör upp enkelt
        </div>
      </div>
    ),
    size
  );
}
