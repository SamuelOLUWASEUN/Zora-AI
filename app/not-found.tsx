import Link from "next/link";

export default function NotFound() {
  const T = { bg: "#09090b", border: "#1e1e24", textPrimary: "#ffffff", textMuted: "#a1a1aa", textDim: "#52525b", fontMono: "'JetBrains Mono', monospace", fontSans: "'Inter', sans-serif" };
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: T.fontSans }}>
      <div style={{ maxWidth: "400px", width: "100%", border: `1px solid ${T.border}`, padding: "28px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: T.textDim }}>404</div>
        <div style={{ fontSize: "18px", fontWeight: 600, color: T.textPrimary }}>Route not found</div>
        <div style={{ fontSize: "13px", color: T.textMuted }}>This path doesn't exist in ShieldVault.</div>
        <Link href="/" style={{ marginTop: "8px", padding: "11px", backgroundColor: T.textPrimary, color: T.bg, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "14px", fontWeight: 600, textDecoration: "none", textAlign: "center", display: "block" }}>
          Return to vault
        </Link>
      </div>
    </div>
  );
}
