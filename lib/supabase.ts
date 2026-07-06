// ─────────────────────────────────────────────
// Zora — Supabase Client Layer
//
// THREE DISTINCT CLIENTS — each has a precise role:
//
// 1. getSupabaseServerClient()
//    → Service-role singleton. Bypasses RLS.
//    → Used ONLY in route handlers that need admin
//      power (e.g. creating records for anon users).
//    → Every query MUST append .eq("user_id", userId)
//      from resolveUserId(). Tagged ISOLATION_ENFORCED.
//
// 2. getSupabaseRouteClient(request, response)
//    → SSR client from @supabase/ssr. Reads session
//      from encrypted httpOnly cookies.
//    → Used in route handlers to verify auth sessions.
//    → RLS applies automatically — double isolation.
//
// 3. getSupabaseBrowserClient()
//    → Anon-key client for browser (login page only).
//    → NEXT_PUBLIC_SUPABASE_ANON_KEY is safe to expose:
//      it has no privileges — RLS blocks everything.
//
// resolveUserId(request)
//    → Single authoritative user ID resolver.
//    → Extracts + verifies the Supabase JWT from the
//      encrypted session cookie on every request.
//    → Throws 401 if session is missing or invalid.
//    → No DEV_USER_ID fallback. No env-pinned IDs.
//    → This is the production-grade implementation.
//
// BUNDLE SAFETY:
//    import "server-only" throws a build-time error if
//    this file is imported into any client component.
// ─────────────────────────────────────────────

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
// DATABASE SCHEMA TYPES
// ─────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          phone: string;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          phone?: string;
          email?: string | null;
        };
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          tags: string[];
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          tags?: string[];
          pinned?: boolean;
        };
        Update: {
          content?: string;
          tags?: string[];
          pinned?: boolean;
          updated_at?: string;
        };
      };
    };
  };
};

// ─────────────────────────────────────────────
// ENV GUARD — fail loudly at startup not at runtime
// ─────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `[Zora] Missing required environment variable: ${key}\n` +
      `Copy .env.example → .env.local and fill in all values.`
    );
  }
  return val;
}

// ─────────────────────────────────────────────
// CLIENT 1 — Service-role singleton (admin power)
// Bypasses RLS. Use only in route handlers.
// Every query MUST include .eq("user_id", userId).
// ─────────────────────────────────────────────

let _serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseServerClient(): ReturnType<typeof createClient<Database>> {
  if (_serviceClient) return _serviceClient;

  _serviceClient = createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  return _serviceClient;
}

// ─────────────────────────────────────────────
// CLIENT 2 — SSR route client (reads cookies)
// Respects RLS. Used to verify sessions in routes.
// Must be created fresh per-request (not singleton).
// ─────────────────────────────────────────────

export function getSupabaseRouteClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: import("@supabase/ssr").CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

// ─────────────────────────────────────────────
// CLIENT 3 — Browser anon client (login page)
// Safe to use client-side. Anon key has no privileges.
// RLS blocks all data access without a valid session.
// ─────────────────────────────────────────────

export function getSupabaseBrowserClient() {
  // This function is called from client components (login page).
  // We read NEXT_PUBLIC_ vars here — intentionally public.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[Zora] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "must be set for the browser client (login page)."
    );
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// ─────────────────────────────────────────────
// resolveUserId — SINGLE authoritative user ID resolver
//
// Extracts and cryptographically verifies the Supabase
// session JWT from the encrypted httpOnly request cookie.
//
// THROWS with a structured 401 payload if:
//   - No session cookie is present
//   - The JWT is expired or tampered
//   - The user record no longer exists in auth.users
//
// Route handlers catch this and return 401 immediately.
// No fallback. No dev bypass. Production from day one.
// ─────────────────────────────────────────────

export class AuthorizationError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function resolveUserId(request: NextRequest): Promise<string> {
  // Create a throw-away response to satisfy the SSR cookie API.
  // We only need this to read cookies — the response is discarded.
  const tempResponse = new Response();

  const supabase = createServerClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: import("@supabase/ssr").CookieOptions }>) {
          // Route handlers: write cookies to the actual response instead.
          // This temp client is read-only — set cookies are intentionally dropped.
          cookiesToSet.forEach(({ name, value }) => {
            (tempResponse as unknown as { cookies: { set: (n: string, v: string) => void } })
              .cookies?.set?.(name, value);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthorizationError(
      "No valid session. Authenticate via /login before accessing this resource."
    );
  }

  // user.id is the auth.uid() — verified JWT claim, not client-supplied
  return user.id;
}

// ─────────────────────────────────────────────
// SQL SCHEMA — run once in Supabase SQL Editor
// ─────────────────────────────────────────────
/*
-- ══════════════════════════════════════════
-- Zora Production Schema
-- Run this entire block in Supabase SQL Editor
-- ══════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── contacts ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_user_id_idx ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS contacts_name_idx    ON public.contacts (user_id, name);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_own_rows"
  ON public.contacts FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── notes ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_user_id_idx  ON public.notes (user_id);
CREATE INDEX IF NOT EXISTS notes_created_idx  ON public.notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_pinned_idx   ON public.notes (user_id, pinned);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_own_rows"
  ON public.notes FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on notes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
*/
