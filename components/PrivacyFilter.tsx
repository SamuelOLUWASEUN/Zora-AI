"use client";

// ─────────────────────────────────────────────
// ShieldVault — Privacy View Filter
//
// When activated, applies a full-viewport blur
// over the message feed. A tight 120px spotlight
// follows the user's pointer/touch, unblurring
// only the region directly under their finger.
// Side-peekers cannot skim the full screen.
//
// Implementation:
//   - Outer wrapper: blurred, darkened overlay
//   - SVG radial mask punches a hole at cursor/touch
//   - mask-image CSS property clips the blur to
//     everything EXCEPT the spotlight circle
//   - onMouseMove / onTouchMove update spotlight
//     position via useRef (no re-renders)
// ─────────────────────────────────────────────

import React, {
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type PointerEvent,
} from "react";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface PrivacyFilterProps {
  /** Content to protect */
  children: ReactNode;
  /** Whether the privacy mask is active */
  active: boolean;
  /** Spotlight radius in px — default 120 */
  spotlightRadius?: number;
  /** CSS class applied to wrapper div */
  className?: string;
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function PrivacyFilter({
  children,
  active,
  spotlightRadius = 120,
  className,
}: PrivacyFilterProps) {
  // Use refs for position — avoids re-render on every pointer move
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const radialRef = useRef<SVGRadialGradientElement>(null);
  const maskRectRef = useRef<SVGRectElement>(null);

  // Track last known position for when filter is toggled on
  const lastPosRef = useRef({ x: -999, y: -999 });

  // ── Spotlight update — direct DOM manipulation ──
  // No setState → no re-render → buttery smooth on mobile
  const updateSpotlight = useCallback(
    (clientX: number, clientY: number) => {
      const overlay = overlayRef.current;
      const svg = svgRef.current;
      if (!overlay || !svg) return;

      const rect = overlay.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      lastPosRef.current = { x, y };

      // Express spotlight as percentage for SVG userSpaceOnUse
      const cx = ((x / w) * 100).toFixed(2);
      const cy = ((y / h) * 100).toFixed(2);

      // Radius as % of the shorter viewport dimension
      const rPx = spotlightRadius;
      const rPct = ((rPx / Math.min(w, h)) * 100).toFixed(2);

      // Update gradient center — direct attribute mutation, zero GC pressure
      const grad = radialRef.current;
      if (grad) {
        grad.setAttribute("cx", `${cx}%`);
        grad.setAttribute("cy", `${cy}%`);
        grad.setAttribute("r", `${rPct}%`);
        grad.setAttribute("fx", `${cx}%`);
        grad.setAttribute("fy", `${cy}%`);
      }
    },
    [spotlightRadius]
  );

  // ── Pointer events (mouse + touch unified) ──
  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      updateSpotlight(e.clientX, e.clientY);
    },
    [active, updateSpotlight]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!active) return;
      const touch = e.touches[0];
      if (touch) updateSpotlight(touch.clientX, touch.clientY);
    },
    [active, updateSpotlight]
  );

  // When filter activates, place spotlight at last known position
  // (avoids the initial "blank" state before first pointer move)
  useEffect(() => {
    if (active) {
      const { x, y } = lastPosRef.current;
      const overlay = overlayRef.current;
      if (overlay && x !== -999) {
        const rect = overlay.getBoundingClientRect();
        updateSpotlight(x + rect.left, y + rect.top);
      }
    }
  }, [active, updateSpotlight]);

  if (!active) {
    // Render children unwrapped — zero overhead when filter is off
    return <>{children}</>;
  }

  return (
    <div
      ref={overlayRef}
      className={className}
      onPointerMove={handlePointerMove}
      onTouchMove={handleTouchMove}
      style={wrapperStyle}
      aria-label="Privacy filter active. Move pointer to read."
    >
      {/* ── Content layer (sits behind the mask) ── */}
      <div style={contentStyle}>{children}</div>

      {/* ── Blur + dark overlay with SVG spotlight cutout ── */}
      <div style={blurLayerStyle} aria-hidden="true">
        {/*
          SVG mask strategy:
          - A radial gradient goes from transparent (center) to black (edge)
          - This gradient is used as a mask on the blur rectangle
          - Result: blur is REMOVED in the spotlight, APPLIED everywhere else
          - No canvas, no canvas2d, no WebGL — pure CSS/SVG
        */}
        <svg
          ref={svgRef}
          style={svgStyle}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <radialGradient
              id="sv-privacy-gradient"
              ref={radialRef}
              cx="50%"
              cy="50%"
              r="15%"
              fx="50%"
              fy="50%"
              gradientUnits="userSpaceOnUse"
            >
              {/* Center: fully transparent (spotlight is clear) */}
              <stop offset="0%" stopColor="black" stopOpacity="0" />
              {/* Inner feather — smooth edge */}
              <stop offset="60%" stopColor="black" stopOpacity="0.05" />
              {/* Outer feather — starts to obscure */}
              <stop offset="85%" stopColor="black" stopOpacity="0.85" />
              {/* Edge: fully opaque (everything outside is blurred/dark) */}
              <stop offset="100%" stopColor="black" stopOpacity="1" />
            </radialGradient>

            <mask id="sv-privacy-mask">
              {/* White = show blur layer; black = punch through to content */}
              <rect width="100%" height="100%" fill="white" />
              <rect
                ref={maskRectRef}
                width="100%"
                height="100%"
                fill="url(#sv-privacy-gradient)"
              />
            </mask>
          </defs>

          {/* Blur + dark tint rectangle, clipped by the mask */}
          <rect
            width="100%"
            height="100%"
            fill="rgba(9,9,11,0.72)"
            mask="url(#sv-privacy-mask)"
            style={{ backdropFilter: "blur(12px)" }}
          />
        </svg>
      </div>

      {/* ── Static status strip at top ── */}
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
  border: "#1e1e24",
  red: "#ef4444",
  textDim: "#52525b",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
} as const;

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  flex: 1,
  overflow: "hidden",
  // Prevent text selection while privacy mode is active
  userSelect: "none",
  WebkitUserSelect: "none",
  cursor: "crosshair",
};

const contentStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  // Intentional: content is rendered normally underneath.
  // The blur overlay sits on top — we don't actually blur
  // the content itself, which would blur the spotlight too.
};

const blurLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 10,
  // CSS backdrop-filter on the SVG rect handles the blur.
  // We need this parent to be non-blocking so pointer events
  // pass through to the wrapper's onPointerMove handler.
};

const svgStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

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
