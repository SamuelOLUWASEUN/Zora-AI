// ─────────────────────────────────────────────
// Zora — /api/contacts Route Handler
// GET  /api/contacts?name=<name>  → lookup by name
// POST /api/contacts              → create contact
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  resolveUserId,
  AuthorizationError,
} from "@/lib/supabase";
import { checkRateLimit, extractIP } from "@/lib/ratelimit";
import type { ContactRecord, ContactLookupResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Discriminated union return type ──────────
type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

async function authenticate(
  request: NextRequest,
  key: string
): Promise<AuthResult> {
  const ip = extractIP(request);
  let rl;
  try {
    rl = await checkRateLimit(`contacts:${key}:${ip}`);
  } catch {
    rl = { success: true, limit: 20, remaining: 19, reset: 0 };
  }

  if (!rl.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    };
  }

  try {
    const userId = await resolveUserId(request);
    return { ok: true, userId };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "unauthorized", message: err.message },
          { status: 401 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "internal_error" }, { status: 500 }),
    };
  }
}

// ── GET — lookup contact by name ─────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "get");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();

  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "name query param is required (min 2 chars)" },
      { status: 400 }
    );
  }

  if (name.replace(/%/g, "").length < 2) {
    return NextResponse.json(
      { error: "name contains insufficient searchable characters" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  const { data, error } = await supabase
    .from("contacts")
    .select("id, user_id, name, phone, email, created_at")
    .eq("user_id", userId)            // ← ISOLATION_ENFORCED
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Zora/contacts GET] DB error:", error.message);
    return NextResponse.json(
      { error: "Database error during contact lookup" },
      { status: 500 }
    );
  }

  if (!data) {
    const response: ContactLookupResponse = {
      found: false,
      error: `No contact found matching "${name}"`,
    };
    return NextResponse.json(response, { status: 404 });
  }

  const row = data as ContactRecord;
  const response: ContactLookupResponse = {
    found: true,
    contact: {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? undefined,
      created_at: row.created_at,
    },
  };
  return NextResponse.json(response);
}

// ── POST — create contact ─────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "post");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: Partial<ContactRecord>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, phone, email } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json(
      { error: "name is required (min 2 chars)" },
      { status: 400 }
    );
  }
  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const sanitisedPhone = phone.replace(/[^\d+\-()\s]/g, "").trim();
  if (sanitisedPhone.length < 7) {
    return NextResponse.json(
      { error: "phone number appears invalid (min 7 digits)" },
      { status: 400 }
    );
  }

  let sanitisedEmail: string | null = null;
  if (email && typeof email === "string" && email.trim().length > 0) {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json(
        { error: "email format is invalid" },
        { status: 400 }
      );
    }
    sanitisedEmail = trimmed;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      user_id: userId,                // ← ISOLATION_ENFORCED
      name: name.trim(),
      phone: sanitisedPhone,
      email: sanitisedEmail,
    })
    .select("id, name, phone, email, created_at")
    .single();

  if (error) {
    console.error("[Zora/contacts POST] DB insert error:", error.message);
    return NextResponse.json(
      {
        error: "Failed to save contact",
        ...(process.env.NODE_ENV === "development" && {
          detail: error.message,
        }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, contact: data }, { status: 201 });
}
