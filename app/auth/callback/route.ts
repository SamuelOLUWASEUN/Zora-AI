// ─────────────────────────────────────────────
// ShieldVault — Auth Callback Route
// GET /auth/callback
//
// Supabase redirects here after the user clicks
// the magic link in their email. This route:
//   1. Exchanges the one-time code for a session
//   2. Sets the encrypted httpOnly session cookie
//   3. Redirects to the original destination or /
//
// Without this route, magic link auth is broken.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  // Validate redirectTo — prevent open redirect attacks
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  if (!code) {
    // No code in URL — likely direct navigation to this route
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  // Build a mutable response to carry the session cookie
  const response = NextResponse.redirect(new URL(safeRedirect, origin));

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write session cookies to the redirect response
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Exchange the one-time code for a persistent session
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[ShieldVault/auth/callback] Code exchange failed:", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=auth_failed&message=${encodeURIComponent(error.message)}`, origin)
    );
  }

  // Session cookie is now set on the response — redirect to destination
  return response;
}
