// ─────────────────────────────────────────────
// Zora — Auth Callback Route
// GET /auth/callback
// Exchanges magic link code for session cookie.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  // Prevent open redirect attacks
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const response = NextResponse.redirect(new URL(safeRedirect, origin));

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[Zora/auth/callback] Code exchange failed:", error.message);
    return NextResponse.redirect(
      new URL(
        `/login?error=auth_failed&message=${encodeURIComponent(error.message)}`,
        origin
      )
    );
  }

  return response;
}
