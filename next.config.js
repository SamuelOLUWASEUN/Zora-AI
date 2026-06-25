/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── Environment variable exposure control ──────────────────
  // In Next.js 14 App Router, server-side env vars (no NEXT_PUBLIC_ prefix)
  // are automatically private — they never appear in the client bundle.
  // serverRuntimeConfig is a legacy Pages Router pattern and does NOT work
  // with App Router or Edge runtime. Remove it entirely.
  //
  // Server-only vars (safe — never in client bundle):
  //   GROQ_API_KEY, GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
  //   SUPABASE_ANON_KEY, SUPABASE_URL, UPSTASH_*
  //
  // Public vars (intentionally in client bundle):
  //   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  //   NEXT_PUBLIC_APP_NAME

  // ── Headers — security hardening ───────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Control referrer info
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — only request permissions we actually use
          {
            key: "Permissions-Policy",
            value: "camera=self, microphone=self, geolocation=()",
          },
        ],
      },
      {
        // API routes: no caching, no sniffing
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
