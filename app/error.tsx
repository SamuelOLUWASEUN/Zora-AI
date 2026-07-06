"use client";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Zora] Unhandled error:", error);
  }, [error]);

  const T = { bg: "#09090b", border: "#1e1e24", textPrimary: "#ffffff", textMuted: "#a1a1aa", textDim: "#52525b", red: "#ef4444", fontMono: "'JetBrains Mono', monospace", fontSans: "'Inter', sans-serif" };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: T.fontSans }}>
      <div style={{ maxWidth: "400px", width: "100%", border: `1px solid ${T.border}`, borderLeft: `2px solid ${T.red}`, padding: "28px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: T.red }}>SYSTEM ERROR</div>
        <div style={{ fontSize: "18px", fontWeight: 600, color: T.textPrimary }}>Something went wrong</div>
        <div style={{ fontSize: "13px", color: T.textMuted, lineHeight: 1.5, fontFamily: T.fontMono }}>
          {process.env.NODE_ENV === "development" ? error.message : "An unexpected error occurred. Your data is safe."}
        </div>
        {error.digest && (
          <div style={{ fontSize: "10px", color: T.textDim, fontFamily: T.fontMono }}>Error ID: {error.digest}</div>
        )}
        <button onClick={reset} style={{ marginTop: "8px", padding: "11px", backgroundColor: T.textPrimary, color: T.bg, border: "none", borderRadius: "4px", fontFamily: T.fontSans, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
          Try again
        </button>
      </div>
    </div>
  );
}
