"use client";

// ─────────────────────────────────────────────
// Zora — Privacy View Filter (v2)
//
// Rebuilt using a pure HTML div + CSS mask-image
// instead of SVG. SVG <rect> elements have very
// inconsistent backdrop-filter support on Android
// Chrome — this is why the original blur felt weak.
//
// A standard HTML div with backdrop-filter + a CSS
// radial-gradient mask is far more reliably supported
// and noticeably stronger.
//
// Spotlight position is updated via CSS custom
// properties (--x, --y) mutated directly on the DOM
// node — no React re-render, smooth on mobile.
// ─────────────────────────────────────────────

import React, {
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type PointerEvent,
  type TouchEvent,
} from "react";

interface PrivacyFilterProps {
  children: ReactNode;
  active: boolean;
  /** Spotlight radius in px — default 110 */
  spotlightRadius?: number;
  className?: string;
}

export default function PrivacyFilter({
  children,
  active,
  spotlightRadius = 110,
  className,
}: PrivacyFilterProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const maskLayerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef({ x: -999, y: -999 });

  // ── Update spotlight position — direct style mutation ──
  const updateSpotlight = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current;
      const maskLayer = maskLayerRef.current;
      if (!overlay || !maskLayer) return;

      const rect = overlay.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      lastPosRef.current = { x, y };

      // Direct CSS custom property mutation — no re-render
      maskLayer.style.setProperty("--spot-x", `${x}px`);
      maskLayer.style.setProperty("--spot-y", `${y}px`);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      updateSpotlight(e.clientX, e.clientY);
    },
    [active, updateSpotlight]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (!active) return;
      const touch = e.touches[0];
      if (touch) updateSpotlight(touch.clientX, touch.clientY);
    },
    [active, updateSpotlight]
  );

  const handleTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (!active) return;
      const touch = e.touches[0];
      if (touch) updateSpotlight(touch.clientX, touch.clientY);
    },
    [active, updateSpotlight]
  );

  // Restore last known spotlight position when re-activated
  useEffect(() => {
    if (active) {
      const { x, y } = lastPosRef.current;
      const overlay = overlayRef.current;
      if (overlay && x !== -999) {
        const rect = overlay.getBoundingClientRect();
        updateSpotlight(x + rect.left, y + rect.top);
      } else if (overlay) {
        // Default to center on first activation
        const rect = overlay.getBoundingClientRect();
        updateSpotlight(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }
  }, [active, updateSpotlight]);

  if (!active) {
    return <>{children}</>;
  }

  return (
    <div
      ref={overlayRef}
      className={className}
      onPointerMove={handlePointerMove}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      style={wrapperStyle}
      aria-label="Privacy filter active. Move finger to read."
    >
      {/* Content layer — rendered normally underneath */}
      <div style={contentStyle}>{children}</div>

      {/* Blur + mask layer — real CSS backdrop-filter on an HTML div */}
      <div
        ref={maskLayerRef}
        style={
          {
            ...maskLayerStyle,
            "--spot-radius": `${spotlightRadius}px`,
          } as React.CSSProperties & Record<string, string>
        }
        aria-hidden="true"
      />

      {/* Status strip */}
      <div style={statusStripStyle} aria-live="polite">
        <span style={statusDotStyle} />
        <span style={statusTextStyle}>PRIVACY FILTER ACTIVE — MOVE TO READ</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const T = {
  bg: "#09090b",
  red: "#ef4444",
  textDim: "#52525b",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
} as const;

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  flex: 1,
  overflow: "hidden",
  userSelect: "none",
  WebkitUserSelect: "none",
  cursor: "crosshair",
  touchAction: "none", // prevent scroll from hijacking touch tracking
};

const contentStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

// The mask layer: a real HTML div with backdrop-filter blur,
// masked by a radial-gradient centered on the spotlight position.
// CSS custom properties --spot-x / --spot-y / --spot-radius are
// mutated directly via JS for smooth 60fps tracking.
const maskLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  pointerEvents: "none",

  // Strong, genuinely visible blur — increased from the original
  // implementation per user feedback that it wasn't blurry enough
  backdropFilter: "blur(22px) saturate(0.7)",
  WebkitBackdropFilter: "blur(22px) saturate(0.7)",
  backgroundColor: "rgba(9, 9, 11, 0.82)",

  // CSS mask: transparent circle (clear spotlight) fading to opaque
  // (fully blurred) — uses CSS custom properties for position
  maskImage:
    "radial-gradient(circle var(--spot-radius, 110px) at var(--spot-x, 50%) var(--spot-y, 50%), transparent 0%, transparent 55%, black 100%)",
  WebkitMaskImage:
    "radial-gradient(circle var(--spot-radius, 110px) at var(--spot-x, 50%) var(--spot-y, 50%), transparent 0%, transparent 55%, black 100%)",

  transition: "backdrop-filter 0.15s ease",
} as React.CSSProperties;

const statusStripStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "6px 16px",
  backgroundColor: "rgba(9,9,11,0.9)",
  borderBottom: `1px solid rgba(239,68,68,0.2)`,
  pointerEvents: "none",
};

const statusDotStyle: React.CSSProperties = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  backgroundColor: T.red,
  flexShrink: 0,
  animation: "pulse 1.5s ease-in-out infinite",
};

const statusTextStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "9px",
  letterSpacing: "0.14em",
  color: T.red,
  opacity: 0.8,
};
