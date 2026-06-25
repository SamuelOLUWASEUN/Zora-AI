"use client";

// ─────────────────────────────────────────────
// Zora — Login Page
// app/login/page.tsx
//
// Single authentication path: Email Magic Link.
// Anonymous auth removed — every user has a real
// isolated account tied to their email address.
//
// To re-enable anonymous auth later: uncomment the
// PATH B block and re-enable in Supabase Auth settings.
// ─────────────────────────────────────────────

import React, { useState, useCallback, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Screen =
  | "idle"
  | "sending"
  | "sent"
  | "error";

export default function LoginPage() {
  const [screen, setScreen] = useState<Screen>("idle");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [redirectTo, setRedirectTo] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dest = params.get("redirectTo");
    if (dest && dest.startsWith("/")) setRedirectTo(dest);

    // Surface auth errors from callback route
    const err = params.get("error");
    if (err === "auth_failed") {
      const msg = params.get("message") ?? "Authentication failed.";
      setErrorMessage(decodeURIComponent(msg));
      setScreen("error");
    }
  }, []);

  const handleMagicLink = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError("");
    setScreen("sending");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setScreen("sent");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send link.");
      setScreen("error");
    }
  }, [email, redirectTo]);

  const reset = useCallback(() => {
    setScreen("idle");
    setEmailError("");
    setErrorMessage("");
  }, []);

  return (
    <div style={s.page}>
      {/* Dot-grid background */}
      <div style={s.grid} aria-hidden="true" />

      <div style={s.card}>
        {/* Wordmark */}
        <div style={s.wordmarkRow}>
          <span style={s.glyph} aria-hidden="true">◈</span>
          <div>
            <div style={s.wordmark}>ZORA</div>
            <div style={s.wordmarkSub}>PRIVACY-FIRST AI CONCIERGE</div>
          </div>
        </div>

        <div style={s.divider} aria-hidden="true" />

        {/* ── SCREEN: idle ── */}
        {screen === "idle" && (
          <>
            <div style={s.sectionLabel}>ACCESS YOUR VAULT</div>
            <p style={s.body}>
              Enter your email. We'll send a secure one-time link —
              no password, no tracking, no data harvested.
            </p>

            <div style={s.fieldWrap}>
              <label htmlFor="zora-email" style={s.fieldLabel}>
                EMAIL ADDRESS
              </label>
              <input
                id="zora-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
                placeholder="you@example.com"
                style={{ ...s.input, ...(emailError ? s.inputErr : {}) }}
                autoFocus
                autoComplete="email"
                aria-describedby={emailError ? "zora-email-err" : undefined}
                aria-invalid={!!emailError}
              />
              {emailError && (
                <span id="zora-email-err" style={s.fieldErr} role="alert">
                  {emailError}
                </span>
              )}
            </div>

            <button style={s.primaryBtn} onClick={handleMagicLink}>
              Send secure link
            </button>

            <p style={s.footnote}>
              A new vault is created automatically on first sign-in.
              Your data is isolated by Row Level Security — no one else
              can access your vault, including us.
            </p>
          </>
        )}

        {/* ── SCREEN: sending ── */}
        {screen === "sending" && (
          <div style={s.statusCenter}>
            <div style={s.dots} aria-label="Sending">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ ...s.dot, animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <div style={s.statusTitle}>Sending link</div>
            <div style={s.statusSub}>Dispatching your secure access link…</div>
          </div>
        )}

        {/* ── SCREEN: sent ── */}
        {screen === "sent" && (
          <div style={s.statusCenter}>
            <div style={s.successGlyph} aria-hidden="true">✓</div>
            <div style={s.statusTitle}>Check your inbox</div>
            <div style={s.statusSub}>
              We sent a link to{" "}
              <strong style={{ color: T.textPrimary }}>{email}</strong>.
              Click it to open your vault.
            </div>
            <div style={s.statusNote}>
              Link expires in 60 minutes · Check spam if it doesn't arrive
            </div>
            <button style={s.ghostBtn} onClick={reset}>
              Use a different email
            </button>
          </div>
        )}

        {/* ── SCREEN: error ── */}
        {screen === "error" && (
          <div style={s.statusCenter}>
            <div style={{ ...s.successGlyph, color: T.red }}>✕</div>
            <div style={{ ...s.statusTitle, color: T.red }}>Something went wrong</div>
            <div style={s.statusSub}>{errorMessage}</div>
            <button style={s.ghostBtn} onClick={reset}>Try again</button>
          </div>
        )}
      </div>

      {/* Privacy promise strip */}
      <div style={s.trustStrip} aria-label="Privacy assurances">
        {["No passwords stored", "End-to-end isolated vault", "Wake word never recorded"].map((item) => (
          <div key={item} style={s.trustItem}>
            <span style={s.trustDot} aria-hidden="true">◆</span>
            <span style={s.trustText}>{item}</span>
          </div>
        ))}
      </div>

      <div style={s.buildTag} aria-hidden="true">
        ZORA · PRIVACY-FIRST AI · {new Date().getFullYear()}
      </div>

      <style>{`
        @keyframes dotPulse {
          0%,80%,100%{transform:scale(.6);opacity:.3}
          40%{transform:scale(1);opacity:1}
        }
        #zora-email:focus {
          border-color: #3f3f46 !important;
          outline: none;
        }
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
  border: "#1e1e24",
  textPrimary: "#ffffff",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#10b981",
  red: "#ef4444",
  radius: "4px",
  fontMono: "'JetBrains Mono','Fira Mono','Courier New',monospace",
  fontSans: "'Inter','Helvetica Neue',Arial,sans-serif",
} as const;

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", backgroundColor: T.bg, display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "24px 16px", fontFamily: T.fontSans, position: "relative", overflow: "hidden",
  },
  grid: {
    position: "absolute", inset: 0,
    backgroundImage: "radial-gradient(circle,#1e1e24 1px,transparent 1px)",
    backgroundSize: "28px 28px", opacity: 0.5, pointerEvents: "none",
  },
  card: {
    position: "relative", zIndex: 1, width: "100%", maxWidth: "400px",
    backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: "6px", padding: "32px 28px",
    display: "flex", flexDirection: "column", gap: "16px",
  },
  wordmarkRow: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" },
  glyph: { fontSize: "28px", color: T.textPrimary, fontFamily: T.fontMono, lineHeight: 1 },
  wordmark: { fontFamily: T.fontMono, fontSize: "16px", fontWeight: 700, letterSpacing: "0.2em", color: T.textPrimary },
  wordmarkSub: { fontFamily: T.fontMono, fontSize: "8px", letterSpacing: "0.12em", color: T.textDim, marginTop: "3px" },
  divider: { height: "1px", backgroundColor: T.border, margin: "4px 0" },
  sectionLabel: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: T.textDim },
  body: { margin: 0, fontSize: "13px", lineHeight: 1.65, color: T.textMuted },
  fieldWrap: { display: "flex", flexDirection: "column", gap: "6px" },
  fieldLabel: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.15em", color: T.textDim },
  input: {
    width: "100%", backgroundColor: T.bg, border: `1px solid ${T.border}`,
    borderRadius: T.radius, padding: "11px 13px", color: T.textPrimary,
    fontFamily: T.fontSans, fontSize: "14px", outline: "none",
    boxSizing: "border-box" as const, transition: "border-color 0.15s",
  },
  inputErr: { borderColor: "#ef4444" },
  fieldErr: { fontFamily: T.fontMono, fontSize: "10px", color: T.red, letterSpacing: "0.03em" },
  primaryBtn: {
    width: "100%", padding: "13px", backgroundColor: T.textPrimary,
    color: T.bg, border: "none", borderRadius: T.radius,
    fontFamily: T.fontSans, fontSize: "14px", fontWeight: 600,
    cursor: "pointer", transition: "opacity 0.15s",
  },
  footnote: {
    margin: 0, fontSize: "11px", lineHeight: 1.6, color: T.textDim,
    textAlign: "center" as const,
  },
  statusCenter: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "12px", padding: "16px 0", textAlign: "center" as const,
  },
  dots: { display: "flex", gap: "6px", alignItems: "center" },
  dot: {
    width: "6px", height: "6px", borderRadius: "50%",
    backgroundColor: T.textMuted, display: "inline-block",
    animation: "dotPulse 1.2s ease-in-out infinite",
  },
  statusTitle: { fontSize: "16px", fontWeight: 600, color: T.textPrimary },
  statusSub: { fontSize: "13px", color: T.textMuted, lineHeight: 1.5, maxWidth: "280px" },
  statusNote: { fontSize: "11px", color: T.textDim, fontFamily: T.fontMono, lineHeight: 1.5 },
  successGlyph: { fontSize: "32px", color: T.textPrimary, fontFamily: T.fontMono, lineHeight: 1 },
  ghostBtn: {
    background: "none", border: `1px solid ${T.border}`, borderRadius: T.radius,
    padding: "10px 20px", color: T.textMuted, fontFamily: T.fontSans,
    fontSize: "13px", cursor: "pointer", marginTop: "8px",
  },
  trustStrip: {
    position: "relative", zIndex: 1, display: "flex", flexWrap: "wrap" as const,
    justifyContent: "center", gap: "16px", marginTop: "24px", padding: "0 16px",
  },
  trustItem: { display: "flex", alignItems: "center", gap: "6px" },
  trustDot: { fontSize: "6px", color: T.green },
  trustText: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.08em", color: T.textDim },
  buildTag: {
    position: "relative", zIndex: 1, marginTop: "20px",
    fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.12em", color: T.textDim,
  },
};
