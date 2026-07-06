"use client";

// ─────────────────────────────────────────────
// Zora — Install Prompt
//
// Chrome doesn't always surface an automatic install banner.
// This component:
//   1. Listens for the native `beforeinstallprompt` event
//   2. If caught, shows an "Install Zora" button that triggers
//      the real native install prompt directly
//   3. If not available (iOS Safari, or already installed),
//      shows a text hint on how to add to home screen manually
//   4. Dismisses permanently via localStorage once used or closed
// ─────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "zora_install_hint_dismissed";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // default hidden until we know
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    try {
      const wasDismissed = localStorage.getItem(DISMISS_KEY);
      setDismissed(!!wasDismissed);
    } catch {
      setDismissed(false);
    }

    // Check if already running as installed PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Capture the native install prompt when Chrome offers it
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch { /* silent */ }
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* silent */ }
  }, []);

  // Don't show anything if: already installed, or user dismissed it
  if (isStandalone || dismissed) return null;

  // Detect platform for the right instructional text
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div style={s.banner} role="status" aria-live="polite">
      <div style={s.textGroup}>
        <span style={s.icon} aria-hidden="true">⬇</span>
        {deferredPrompt ? (
          <span style={s.text}>Install Zora for the full app experience</span>
        ) : isIOS ? (
          <span style={s.text}>
            Add to Home Screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>
          </span>
        ) : (
          <span style={s.text}>
            Add to Home Screen: tap <strong>⋮</strong> menu → <strong>Add to Home screen</strong>
          </span>
        )}
      </div>
      <div style={s.actions}>
        {deferredPrompt && (
          <button style={s.installBtn} onClick={handleInstallClick}>
            Install
          </button>
        )}
        <button style={s.dismissBtn} onClick={handleDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

const T = {
  bg: "#09090b",
  border: "#1e1e24",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#10b981",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
  fontSans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
} as const;

const s: Record<string, React.CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "8px 16px",
    borderTop: `1px solid ${T.border}`,
    backgroundColor: "rgba(16,185,129,0.04)",
  },
  textGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
    minWidth: 0,
  },
  icon: { fontSize: "12px", color: T.green, flexShrink: 0 },
  text: {
    fontFamily: T.fontMono,
    fontSize: "10px",
    letterSpacing: "0.03em",
    color: T.textMuted,
    lineHeight: 1.4,
  },
  actions: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 },
  installBtn: {
    padding: "5px 12px",
    backgroundColor: T.green,
    color: T.bg,
    border: "none",
    borderRadius: "4px",
    fontFamily: T.fontSans,
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dismissBtn: {
    background: "none",
    border: "none",
    color: T.textDim,
    cursor: "pointer",
    fontSize: "12px",
    padding: "2px 4px",
  },
};
