// ─────────────────────────────────────────────
// ShieldVault — Next.js Middleware
//
// Intercepts ALL requests. Enforces two rules:
//
// RULE 1 — Protected routes (/dashboard/*, /api/*)
//   If no valid Supabase session cookie → redirect /login
//   (for page routes) or return 401 JSON (for API routes).
//
// RULE 2 — Auth routes (/login)
//   If user already has a valid session → redirect /dashboard
//   Prevents authenticated users hitting the login page.
//
// RULE 3 — Session refresh
//   On every request, refresh the session token if it is
//   approaching expiry. Supabase SSR handles this via the
//   cookie setAll callback — this keeps sessions alive
//   without forcing the user to re-login.
//
// Runs on the Edge runtime — no Node.js APIs.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Paths that require an authenticated session
const PROTECTED_PAGE_PREFIXES = ["/dashboard"];
const PROTECTED_API_PREFIXES = ["/api/agent", "/api/contacts", "/api/notes"];

// Paths that are only for unauthenticated users
const AUTH_ONLY_PATHS = ["/login"];

// Fully public paths — no auth check at all
const PUBLIC_PATHS = ["/landing", "/pricing"];

// Paths the middleware completely ignores (static assets, etc.)
const IGNORED_PREFIXES = ["/_next", "/favicon", "/icons", "/manifest"];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Skip middleware for static assets ────────
  if (IGNORED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Skip middleware for fully public pages ────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Build a mutable response to carry cookie refreshes ──
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ── Create SSR Supabase client ───────────────
  // This client reads the encrypted session cookie and
  // refreshes it if needed, writing the new token back
  // via setAll so the browser receives the updated cookie.
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          // Write refreshed tokens back to both request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Verify session — getUser() validates the JWT ──
  // getUser() is the correct method: it verifies the token
  // server-side. getSession() only reads the cookie without
  // JWT verification and is NOT safe for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  // ── RULE 0: Protect root path exactly ──────────
  // "/" is the main app — requires auth.
  // Must check before prefix rules to avoid catching everything.
  if (pathname === "/") {
    if (!isAuthenticated) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("redirectTo", "/");
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  // ── RULE 1: Protect page routes ──────────────
  if (PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAuthenticated) {
      const redirectUrl = new URL("/login", request.url);
      // Preserve the intended destination for post-login redirect
      redirectUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  // ── RULE 1: Protect API routes ───────────────
  if (PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          error: "unauthorized",
          message: "Valid session required. Authenticate via /login.",
        },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer realm="ShieldVault API"',
          },
        }
      );
    }
    return response;
  }

  // ── RULE 2: Redirect authenticated users away from /login ──
  if (AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // ── Default: pass through with refreshed session cookies ──
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static  (Next.js build artifacts)
     * - _next/image   (Next.js image optimisation)
     * - favicon.ico
     * The negative lookahead keeps the matcher lean.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
