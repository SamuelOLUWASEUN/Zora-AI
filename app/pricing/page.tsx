// ─────────────────────────────────────────────
// Zora — Pricing Page
// app/pricing/page.tsx
// Server component — no "use client" needed.
// ─────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Zora AI",
  description: "Simple, honest pricing. Your vault, your data, your terms.",
};

// ─────────────────────────────────────────────
// PLAN DATA
// ─────────────────────────────────────────────

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "£0",
    period: "forever",
    description: "Try Zora with no commitment. Full feature access, reasonable limits.",
    cta: "Start free",
    ctaHref: "/login",
    highlight: false,
    features: [
      { text: "20 AI messages per day", included: true },
      { text: "10 saved notes", included: true },
      { text: "5 saved contacts", included: true },
      { text: "Lockdown Mode", included: true },
      { text: "Privacy Filter", included: true },
      { text: "Torch & screen flash", included: true },
      { text: "Hands-free voice mode", included: false },
      { text: "Vault Memory (AI context)", included: false },
      { text: "Unlimited notes & contacts", included: false },
      { text: "Priority AI response speed", included: false },
    ],
  },
  {
    id: "personal",
    name: "Personal",
    price: "£4.99",
    period: "per month",
    description: "For daily personal use. Every feature unlocked. Built for people who take their privacy seriously.",
    cta: "Get Personal",
    ctaHref: "/login",
    highlight: true,
    features: [
      { text: "Unlimited AI messages", included: true },
      { text: "Unlimited notes", included: true },
      { text: "Unlimited contacts", included: true },
      { text: "Lockdown Mode", included: true },
      { text: "Privacy Filter", included: true },
      { text: "Torch & screen flash", included: true },
      { text: "Hands-free voice mode", included: true },
      { text: "Vault Memory (AI context)", included: true },
      { text: "Priority AI response speed", included: false },
      { text: "End-to-end encrypted notes", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "£12.99",
    period: "per month",
    description: "For professionals using Zora for real work. Maximum security, maximum speed.",
    cta: "Get Pro",
    ctaHref: "/login",
    highlight: false,
    features: [
      { text: "Everything in Personal", included: true },
      { text: "End-to-end encrypted notes", included: true },
      { text: "Priority AI response speed", included: true },
      { text: "Calendar integration", included: true },
      { text: "Multi-device vault sync", included: true },
      { text: "Advanced contact management", included: true },
      { text: "Vault export (JSON)", included: true },
      { text: "Early access to new features", included: true },
      { text: "Priority support", included: true },
      { text: "Custom wake word (coming soon)", included: false },
    ],
  },
];

const FAQS = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade or downgrade at any time. If you downgrade, you keep access until the end of your billing period.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your vault is yours. You can export everything before cancelling. After 30 days of inactivity on a cancelled account, data is purged — you'll receive an email warning before that happens.",
  },
  {
    q: "Is the free plan actually free?",
    a: "Yes — no credit card required. The free tier has real limits (20 messages/day, 10 notes) but gives you full access to every privacy and security feature.",
  },
  {
    q: "What does end-to-end encrypted notes mean?",
    a: "On Pro, your note content is encrypted in your browser before it's sent to the database. Even a Supabase infrastructure breach would expose only ciphertext — meaningless without your key. This is a Phase 3 feature currently in development.",
  },
];

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div style={s.page}>
      <div style={s.gridBg} aria-hidden="true" />

      {/* ── NAV ── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <Link href="/landing" style={s.navBrand}>
            <span style={s.navGlyph} aria-hidden="true">◈</span>
            <span style={s.navWordmark}>ZORA</span>
          </Link>
          <div style={s.navActions}>
            <Link href="/landing" style={s.navLink}>Back to home</Link>
            <Link href="/login" style={s.navCta}>Get access →</Link>
          </div>
        </div>
      </nav>

      {/* ── HEADER ── */}
      <section style={s.header} aria-labelledby="pricing-heading">
        <div style={s.headerInner}>
          <div style={s.sectionLabel}>PRICING</div>
          <h1 id="pricing-heading" style={s.heroH1}>
            Simple, honest pricing.
          </h1>
          <p style={s.heroSub}>
            No dark patterns. No annual lock-in required. No data sold to advertisers — ever.
            Zora's business model is your subscription, full stop.
          </p>
        </div>
      </section>

      {/* ── PLANS ── */}
      <section style={s.plansSection} aria-label="Pricing plans">
        <div style={s.plansGrid}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                ...s.planCard,
                ...(plan.highlight ? s.planCardHighlight : {}),
              }}
              aria-label={`${plan.name} plan`}
            >
              {plan.highlight && (
                <div style={s.popularBadge} aria-label="Most popular">
                  MOST POPULAR
                </div>
              )}

              <div style={s.planHeader}>
                <div style={s.planName}>{plan.name}</div>
                <div style={s.planPriceRow}>
                  <span style={s.planPrice}>{plan.price}</span>
                  <span style={s.planPeriod}>{plan.period}</span>
                </div>
                <p style={s.planDesc}>{plan.description}</p>
              </div>

              <Link
                href={plan.ctaHref}
                style={{
                  ...s.planCta,
                  ...(plan.highlight ? s.planCtaHighlight : {}),
                }}
                aria-label={`${plan.cta} — ${plan.name} plan`}
              >
                {plan.cta}
              </Link>

              <div style={s.planDivider} aria-hidden="true" />

              <ul style={s.featureList} aria-label={`${plan.name} features`}>
                {plan.features.map(({ text, included }) => (
                  <li key={text} style={s.featureItem} aria-label={`${text}: ${included ? "included" : "not included"}`}>
                    <span
                      style={{
                        ...s.featureCheck,
                        color: included ? "#10b981" : "#3f3f46",
                      }}
                      aria-hidden="true"
                    >
                      {included ? "✓" : "–"}
                    </span>
                    <span
                      style={{
                        ...s.featureText,
                        color: included ? "#a1a1aa" : "#52525b",
                      }}
                    >
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── GUARANTEE ── */}
      <section style={s.guaranteeSection} aria-labelledby="guarantee-heading">
        <div style={s.guaranteeInner}>
          <span style={s.guaranteeGlyph} aria-hidden="true">◈</span>
          <div>
            <h2 id="guarantee-heading" style={s.guaranteeTitle}>
              Privacy is not a feature. It's the foundation.
            </h2>
            <p style={s.guaranteeBody}>
              Zora has no advertising revenue. No data brokering. No "free tier funded by your attention."
              The only way we make money is if you find Zora genuinely useful enough to pay for it.
              That alignment is intentional.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={s.faqSection} aria-labelledby="faq-heading">
        <div style={s.faqInner}>
          <div style={s.sectionLabel}>COMMON QUESTIONS</div>
          <h2 id="faq-heading" style={s.sectionH2}>Straight answers.</h2>
          <div style={s.faqGrid}>
            {FAQS.map(({ q, a }) => (
              <div key={q} style={s.faqCard}>
                <div style={s.faqQ}>{q}</div>
                <p style={s.faqA}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={s.ctaSection} aria-labelledby="cta-heading">
        <div style={s.ctaInner}>
          <h2 id="cta-heading" style={s.ctaH2}>Start with free. Upgrade when you're ready.</h2>
          <p style={s.ctaSub}>No credit card. No dark patterns. Just your vault.</p>
          <Link href="/login" style={s.ctaBtn}>Open Zora →</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <span style={s.footerBrand}>◈ ZORA</span>
          <div style={s.footerLinks}>
            <Link href="/landing" style={s.footerLink}>Home</Link>
            <Link href="/pricing" style={s.footerLink}>Pricing</Link>
            <Link href="/login" style={s.footerLink}>Sign in</Link>
          </div>
          <span style={s.footerYear}>{new Date().getFullYear()}</span>
        </div>
      </footer>

      <style>{`
        a { text-decoration: none; }
        ul { list-style: none; margin: 0; padding: 0; }
        @media (max-width: 900px) {
          .zora-plans-grid { grid-template-columns: 1fr !important; max-width: 440px !important; margin: 0 auto !important; }
          .zora-faq-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .zora-hero-h1 { font-size: 28px !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOKENS + STYLES
// ─────────────────────────────────────────────

const T = {
  bg: "#09090b", bgCard: "#111113", bgHighlight: "#0d1a13",
  border: "#1e1e24", borderHighlight: "#10b981",
  textPrimary: "#ffffff", textMuted: "#a1a1aa", textDim: "#52525b",
  green: "#10b981",
  fontMono: "'JetBrains Mono','Fira Mono','Courier New',monospace",
  fontSans: "'Inter','Helvetica Neue',Arial,sans-serif",
} as const;

const s: Record<string, React.CSSProperties> = {
  page: { backgroundColor: T.bg, fontFamily: T.fontSans, color: T.textPrimary, position: "relative", minHeight: "100dvh" },
  gridBg: { position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle,#1e1e24 1px,transparent 1px)", backgroundSize: "28px 28px", opacity: 0.35, pointerEvents: "none", zIndex: 0 },

  nav: { position: "sticky", top: 0, zIndex: 100, backgroundColor: "rgba(9,9,11,0.92)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.border}` },
  navInner: { maxWidth: "1100px", margin: "0 auto", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  navBrand: { display: "flex", alignItems: "center", gap: "10px" },
  navGlyph: { fontSize: "20px", fontFamily: T.fontMono, color: T.textPrimary },
  navWordmark: { fontFamily: T.fontMono, fontSize: "13px", fontWeight: 700, letterSpacing: "0.18em", color: T.textPrimary },
  navActions: { display: "flex", alignItems: "center", gap: "12px" },
  navLink: { fontFamily: T.fontSans, fontSize: "13px", color: T.textMuted, padding: "6px 12px" },
  navCta: { fontFamily: T.fontSans, fontSize: "13px", fontWeight: 500, color: T.bg, backgroundColor: T.textPrimary, padding: "7px 16px", borderRadius: "4px" },

  header: { position: "relative", zIndex: 1, padding: "72px 24px 48px" },
  headerInner: { maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" },
  sectionLabel: { fontFamily: T.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: T.textDim },
  heroH1: { margin: 0, fontSize: "44px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" },
  heroSub: { margin: 0, fontSize: "16px", lineHeight: 1.7, color: T.textMuted },
  sectionH2: { margin: 0, fontSize: "30px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em" },

  plansSection: { position: "relative", zIndex: 1, padding: "0 24px 80px" },
  plansGrid: { maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", alignItems: "start" },

  planCard: { position: "relative", backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "28px 24px", display: "flex", flexDirection: "column", gap: "20px" },
  planCardHighlight: { backgroundColor: T.bgHighlight, borderColor: T.green },
  popularBadge: { position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", backgroundColor: T.green, color: T.bg, fontFamily: T.fontMono, fontSize: "8px", letterSpacing: "0.15em", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", whiteSpace: "nowrap" as const },

  planHeader: { display: "flex", flexDirection: "column", gap: "8px" },
  planName: { fontFamily: T.fontMono, fontSize: "10px", letterSpacing: "0.18em", color: T.textDim },
  planPriceRow: { display: "flex", alignItems: "baseline", gap: "6px" },
  planPrice: { fontSize: "36px", fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.02em" },
  planPeriod: { fontSize: "12px", color: T.textDim, fontFamily: T.fontMono },
  planDesc: { margin: 0, fontSize: "13px", color: T.textMuted, lineHeight: 1.6 },

  planCta: { display: "block", textAlign: "center" as const, padding: "12px", border: `1px solid ${T.border}`, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "14px", fontWeight: 500, color: T.textMuted, transition: "all 0.15s" },
  planCtaHighlight: { backgroundColor: T.green, borderColor: T.green, color: T.bg, fontWeight: 600 },

  planDivider: { height: "1px", backgroundColor: T.border },
  featureList: { display: "flex", flexDirection: "column", gap: "10px" },
  featureItem: { display: "flex", alignItems: "flex-start", gap: "10px" },
  featureCheck: { fontFamily: T.fontMono, fontSize: "12px", flexShrink: 0, marginTop: "1px" },
  featureText: { fontSize: "13px", lineHeight: 1.4 },

  guaranteeSection: { position: "relative", zIndex: 1, backgroundColor: T.bgCard, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: "48px 24px" },
  guaranteeInner: { maxWidth: "800px", margin: "0 auto", display: "flex", gap: "20px", alignItems: "flex-start" },
  guaranteeGlyph: { fontSize: "28px", fontFamily: T.fontMono, color: T.green, flexShrink: 0, marginTop: "4px" },
  guaranteeTitle: { margin: "0 0 12px", fontSize: "20px", fontWeight: 600, color: T.textPrimary, lineHeight: 1.3 },
  guaranteeBody: { margin: 0, fontSize: "14px", color: T.textMuted, lineHeight: 1.7 },

  faqSection: { position: "relative", zIndex: 1, padding: "80px 24px" },
  faqInner: { maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "40px" },
  faqGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px" },
  faqCard: { padding: "20px 22px", border: `1px solid ${T.border}`, borderRadius: "4px", borderLeft: `2px solid ${T.green}`, display: "flex", flexDirection: "column", gap: "10px" },
  faqQ: { fontSize: "14px", fontWeight: 600, color: T.textPrimary },
  faqA: { margin: 0, fontSize: "13px", color: T.textMuted, lineHeight: 1.65 },

  ctaSection: { position: "relative", zIndex: 1, padding: "80px 24px" },
  ctaInner: { maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", textAlign: "center" as const },
  ctaH2: { margin: 0, fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em", color: T.textPrimary, lineHeight: 1.2 },
  ctaSub: { margin: 0, fontSize: "15px", color: T.textMuted },
  ctaBtn: { padding: "14px 36px", backgroundColor: T.textPrimary, color: T.bg, borderRadius: "4px", fontFamily: T.fontSans, fontSize: "15px", fontWeight: 600 },

  footer: { position: "relative", zIndex: 1, borderTop: `1px solid ${T.border}`, padding: "24px" },
  footerInner: { maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: "12px" },
  footerBrand: { fontFamily: T.fontMono, fontSize: "12px", fontWeight: 700, letterSpacing: "0.15em", color: T.textPrimary },
  footerLinks: { display: "flex", gap: "20px" },
  footerLink: { fontFamily: T.fontMono, fontSize: "10px", letterSpacing: "0.06em", color: T.textDim },
  footerYear: { fontFamily: T.fontMono, fontSize: "10px", color: T.textDim },
};
