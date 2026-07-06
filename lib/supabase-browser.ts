// ─────────────────────────────────────────────
// Zora — Browser Supabase Client
//
// Uses createBrowserClient from @supabase/ssr — NOT
// the plain createClient from @supabase/supabase-js.
//
// WHY THIS MATTERS:
// createBrowserClient automatically uses the PKCE auth
// flow and writes the session into cookies (not just
// localStorage). This is what makes /auth/callback able
// to exchange a `?code=` param for a session server-side.
//
// The plain createClient defaults to implicit flow,
// which returns tokens as a URL fragment (#access_token=...)
// that only JavaScript can read — never reaches the server,
// and our /auth/callback route (which expects ?code=) fails
// with "missing_code".
//
// This file is SAFE to import from client components.
// It uses NEXT_PUBLIC_ env vars (anon key only) — zero
// privileges without a valid session, RLS blocks everything.
// ─────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";

let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[Zora] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "must be set in .env.local for the browser client."
    );
  }

  _browserClient = createBrowserClient(url, anonKey);

  return _browserClient;
}
