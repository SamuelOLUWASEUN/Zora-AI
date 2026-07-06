// ─────────────────────────────────────────────
// Zora — Landing Page
// app/landing/page.tsx
//
// Server component — no "use client" needed.
// Shown before login. Judges and new users land here.
// Answers: what is this, why trust it, how do I start.
// ─────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zora — Privacy-First AI Concierge",
  description:
    "Your AI concierge that works for you without working against you. Voice commands, private notes, and contacts — all on-device. Your data never leaves your session.",
};

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────

const FEATURES = [
  {
    glyph: "◎",
    title: "Hey Zora — Hands-Free",
    body: "Say the wake word and give any command. Zora listens, acts, and speaks back. Every other word you say is discarded instantly — never stored, never forwarded.",
  },
  {
    glyph: "◈",
    title: "Private Vault Notes",
    body: "Say \"Note that my meeting moved to Thursday.\" Saved to your encrypted vault in under a second. Auto-tagged. Searchable. Yours alone.",
  },
  {
    glyph: "◉",
    title: "One-Tap Contacts & Calls",
    body: "Say \"Call Mubarak.\" Zora finds the number, shows you the confirmation, and opens your native dialler. It never dials without your explicit tap.",
  },
  {
    glyph: "⬛",
    title: "Lockdown Mode",
    body: "One tap seals the vault completely. No AI prompts get through. No data is visible. Disengage with the same tap. Works by voice too.",
  },
  {
    glyph: "◑",
    title: "Privacy Filter",
    body: "Blurs your entire screen in public. Only the spot your finger touches is readable. The person next to you sees nothing.",
  },
  {
    glyph: "⚡",
    title: "Hardware Torch",
    body: "\"Hey Zora, torch on.\" Your rear camera flash activates instantly. No app switch. Falls back to a full-screen flash on unsupported devices.",
  },
];

const TRUST_POINTS = [
  {
    q: "Can Zora read my notes?",
    a: "No. Your notes are isolated at the database level using Row Level Security. Structurally, no other user — and no Zora administrator — can query your rows. The isolation is enforced by the database engine, not by application code.",
  },
  {
    q: "Does the wake word record everything?",
    a: "No. The speech recognition stream runs locally in your browser. If the wake word \"Hey Zora\" is not detected in a given audio segment, that transcript string is immediately discarded from memory. Nothing is sent to any server.",
  },
  {
    q: "Does Zora act without asking?",
    a: "Never for destructive actions. Calls require you to tap \"Call now\" on the confirmation overlay. Lockdown requires a deliberate toggle. The AI processes intent — it does not have autonomous agency.",
  },
  {
    q: "Where does my data go?",
    a: "Notes and contacts are stored in your private Supabase vault. Vault Memory — the AI's contextual understanding of your preferences — lives in your browser's IndexedDB. It never touches a server.",
  },
];

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div style={s.page}>

      {/* ── Grid texture ── */}
      <div style={s.gridBg} aria-hidden="true" />

      {/* ── NAV ── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.navBrand}>
            <span style={s.navGlyph} aria-hidden="true">◈</span>
            <span style={s.navWordmark}>ZORA</span>
          </div>
          <div style={s.navActions}>
            <Link href="/pricing" style={s.navLink}>Pricing</Link>
            <Link href="/login" style={s.navLink}>Sign in</Link>
            <Link href="/login" style={s.navCta}>Get access →</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={s.hero} aria-labelledby="hero-heading">
        <div style={s.heroInner}>
          <div style={s.heroBadge}>
            <span style={s.heroBadgeDot} aria-hidden="true" />
            PRIVACY-FIRST AI CONCIERGE
          </div>

          <h1 id="hero-heading" style={s.heroH1}>
            The AI that works
            <br />
            <span style={s.heroAccent}>for you, not on you.</span>
          </h1>

          <p style={s.heroSub}>
            Voice commands. Private notes. Secure contacts. Hands-free operation.
            Your data never leaves your device session — not because we promise it,
            but because the architecture makes it impossible.
          </p>

          <div style={s.heroActions}>
            <Link href="/login" style={s.heroPrimaryBtn}>
              Open your vault
            </Link>
            <a href="#how-it-works" style={s.heroGhostBtn}>
              See how it works
            </a>
          </div>

          {/* Terminal demo block */}
          <div style={s.terminal} aria-label="Example Zora commands" role="region">
            <div style={s.terminalBar}>
              <span style={s.terminalDot} aria-hidden="true" />
              <span style={{ ...s.terminalDot, backgroundColor: "#52525b" }} aria-hidden="true" />
              <span style={{ ...s.terminalDot, backgroundColor: "#3f3f46" }} aria-hidden="true" />
              <span style={s.terminalTitle}>ZORA VOICE COMMANDS</span>
            </div>
            {[
              { cmd: "Hey Zora, note that my investor call is Friday at 11am", res: "Noted and saved. Tagged: schedule." },
              { cmd: "Hey Zora, call Mubarak", res: "Found Mubarak · +44 7700 900000 — tap to confirm." },
              { cmd: "Hey Zora, activate lockdown", res: "Lockdown protocol engaged." },
              { cmd: "Hey Zora, what should I focus on today?", res: "Based on your vault context, you have an investor call Friday. Recommend preparing your deck today." },
            ].map(({ cmd, res }, i) => (
              <div key={i} style={s.terminalLine}>
                <div style={s.terminalCmd}>
                  <span style={s.terminalPrompt} aria-hidden="true">▶</span>
                  <span style={s.terminalCmdText}>{cmd}</span>
                </div>
                <div style={s.terminalRes}>
                  <span style={s.terminalResPrefix} aria-hidden="true">ZORA</span>
                  <span style={s.terminalResText}>{res}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section
        id="how-it-works"
        style={s.section}
        aria-labelledby="features-heading"
      >
        <div style={s.sectionInner}>
          <div style={s.sectionLabel}>WHAT ZORA DOES</div>
          <h2 id="features-heading" style={s.sectionH2}>
            Every feature built around privacy.
          </h2>
          <div style={s.featureGrid}>
            {FEATURES.map(({ glyph, title, body }) => (
              <div key={title} style={s.featureCard}>
                <span style={s.featureGlyph} aria-hidden="true">{glyph}</span>
                <div style={s.featureTitle}>{title}</div>
                <p style={s.featureBody}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST / FAQ ── */}
      <section style={s.trustSection} aria-labelledby="trust-heading">
        <div style={s.sectionInner}>
          <div style={s.sectionLabel}>SECURITY & PRIVACY</div>
          <h2 id="trust-heading" style={s.sectionH2}>
            Honest answers to hard questions.
          </h2>
          <div style={s.trustGrid}>
            {TRUST_POINTS.map(({ q, a }) => (
              <div key={q} style={s.trustCard}>
                <div style={s.trustQ}>{q}</div>
                <p style={s.trustA}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={s.ctaSection} aria-labelledby="cta-heading">
        <div style={s.ctaInner}>
          <span style={s.ctaGlyph} aria-hidden="true">◈</span>
          <h2 id="cta-heading" style={s.ctaH2}>
            Your vault is one click away.
          </h2>
          <p style={s.ctaSub}>
            Enter your email. Get a magic link. No password. No credit card.
            Your isolated vault is created instantly on first sign-in.
          </p>
          <Link href="/login" style={s.ctaBtn}>
            Open Zora →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <span style={s.footerBrand}>◈ ZORA</span>
          <span style={s.footerMid}>Privacy-first AI · Built for humans, not advertisers</span>
          <span style={s.footerYear}>{new Date().getFullYear()}</span>
        </div>
      </footer>

      <style>{`
        @media (max-width: 640px) {
          .zora-hero-h1 { font-size: 32px !important; }
          .zora-feature-grid { grid-template-columns: 1fr !important; }
          .zora-trust-grid { grid-template-columns: 1fr !important; }
          .zora-terminal { display: none !important; }
          .zora-hero-actions { flex-direction: column !important; }
        }
        a { text-decoration: none; }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOKENS + STYLES
// ─────────────────────────────────────────────

const T = {
  bg: "#09090b",
  bgCard: "#111113",
  bgHover: "#18181b",
  border: "#1e1e24",
  textPrimary: "#ffffff",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#10b981",
  fontMono: "'JetBrains Mono','Fira Mono','Courier New',monospace",
  fontSans: "'Inter','Helvetica Neue',Arial,sans-serif",
} as const;

const s: Record<string, React.CSSProperties> = {
  page: { backgroundColor: T.bg, fontFamily: T.fontSans, color: T.textPrimary, position: "relative", overflowX: "hidden" },
  gridBg: { position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle,#1e1e24 1px,transparent 1px)", backgroundSize: "28px 28px", opacity: 0.35, pointerEvents: "none", zIndex: 0 },

  // Nav
  nav: { position: "sticky", top: 0, zIndex: 100, backgroundColor: "rgba(9,9,11,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.border}` },
  navInner: { maxWidth: "1100px", margin: "0 auto", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  navBrand: { display: "flex", alignItems: "center", gap: "10px" },
  navGlyph: { fontSize: "20px", fontFamily: T.fontMono, color: T.textPrimary },
  navWordmark: { fontFamily: T.fontMono, fontSize: "13px", fontWeight: 700, letterSpacing: "0.18em", color: T.textPrimary },
  navActions: { display: "flex", alignItems: "center", gap: "12px" },
  navLink: { fontFamily: T.fontSans, fontSize: "13px", color: T.textMuted, padding: "6px 12px" },
  navCta: { fontFamily: T.fontSans, fontSize: "13px", fontWeight: 500, color: T.bg, backgroundColor: T.textPrimary, padding: "7px 16px", borderRadius: "4px" },

  // Hero
  hero: { position: "relative", zIndex: 1, padding: "80px 24px 64px" },
  heroInner: { maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" },
  heroBadge: { display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.18em", color: T.green, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "4px", padding: "5px 10px", alignSelf: "flex-start" },
  heroBadgeDot: { width: "5px", height: "5px", borderRadius: "50%", backgroundColor: T.green, flexShrink: 0 },
  heroH1: { margin: 0, fontSize: "52px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: T.textPrimary },
  heroAccent: { color: T.green },
  heroSub: { margin: 0, fontSize: "17px", lineHeight: 1.7, color: T.textMuted, maxWidth: "600px" },
  heroActions: { display: "flex", gap: "12px", flexWrap: "wrap" as const },
  heroPrimaryBtn: { padding: "13px 28px", backgroundColor: T.textPrimary, color: T.bg, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "14px", fontWeight: 600 },
  heroGhostBtn: { padding: "13px 24px", border: `1px solid ${T.border}`, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "14px", color: T.textMuted },

  // Terminal
  terminal: { backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "6px", overflow: "hidden" },
  terminalBar: { display: "flex", alignItems: "center", gap: "6px", padding: "10px 14px", borderBottom: `1px solid ${T.border}` },
  terminalDot: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ef4444", flexShrink: 0 },
  terminalTitle: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.14em", color: T.textDim, marginLeft: "4px" },
  terminalLine: { padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: "6px" },
  terminalCmd: { display: "flex", gap: "10px", alignItems: "flex-start" },
  terminalPrompt: { color: T.green, fontFamily: T.fontMono, fontSize: "11px", flexShrink: 0, marginTop: "1px" },
  terminalCmdText: { fontFamily: T.fontMono, fontSize: "12px", color: T.textMuted, lineHeight: 1.4 },
  terminalRes: { display: "flex", gap: "10px", alignItems: "flex-start", paddingLeft: "20px" },
  terminalResPrefix: { fontFamily: T.fontMono, fontSize: "8px", letterSpacing: "0.12em", color: T.green, flexShrink: 0, marginTop: "2px", padding: "1px 5px", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "2px" },
  terminalResText: { fontFamily: T.fontMono, fontSize: "12px", color: T.textPrimary, lineHeight: 1.4 },

  // Sections
  section: { position: "relative", zIndex: 1, padding: "80px 24px" },
  trustSection: { position: "relative", zIndex: 1, padding: "80px 24px", backgroundColor: T.bgCard, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` },
  sectionInner: { maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "40px" },
  sectionLabel: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: T.textDim },
  sectionH2: { margin: 0, fontSize: "36px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em", color: T.textPrimary, maxWidth: "600px" },

  // Features
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" },
  featureCard: { padding: "20px", border: `1px solid ${T.border}`, borderRadius: "4px", backgroundColor: T.bgCard, display: "flex", flexDirection: "column", gap: "10px" },
  featureGlyph: { fontSize: "20px", fontFamily: T.fontMono, color: T.textMuted, lineHeight: 1 },
  featureTitle: { fontSize: "14px", fontWeight: 600, color: T.textPrimary, lineHeight: 1.3 },
  featureBody: { margin: 0, fontSize: "13px", color: T.textMuted, lineHeight: 1.6 },

  // Trust
  trustGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px" },
  trustCard: { padding: "20px 22px", border: `1px solid ${T.border}`, borderRadius: "4px", borderLeft: `2px solid ${T.green}`, display: "flex", flexDirection: "column", gap: "10px" },
  trustQ: { fontSize: "14px", fontWeight: 600, color: T.textPrimary },
  trustA: { margin: 0, fontSize: "13px", color: T.textMuted, lineHeight: 1.65 },

  // CTA
  ctaSection: { position: "relative", zIndex: 1, padding: "96px 24px" },
  ctaInner: { maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", textAlign: "center" as const },
  ctaGlyph: { fontSize: "36px", fontFamily: T.fontMono, color: T.textPrimary },
  ctaH2: { margin: 0, fontSize: "36px", fontWeight: 700, letterSpacing: "-0.02em", color: T.textPrimary, lineHeight: 1.15 },
  ctaSub: { margin: 0, fontSize: "15px", color: T.textMuted, lineHeight: 1.7, maxWidth: "440px" },
  ctaBtn: { padding: "14px 36px", backgroundColor: T.textPrimary, color: T.bg, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "15px", fontWeight: 600 },

  // Footer
  footer: { position: "relative", zIndex: 1, borderTop: `1px solid ${T.border}`, padding: "24px" },
  footerInner: { maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: "12px" },
  footerBrand: { fontFamily: T.fontMono, fontSize: "12px", fontWeight: 700, letterSpacing: "0.15em", color: T.textPrimary },
  footerMid: { fontFamily: T.fontMono, fontSize: "10px", letterSpacing: "0.06em", color: T.textDim },
  footerYear: { fontFamily: T.fontMono, fontSize: "10px", color: T.textDim },
};
