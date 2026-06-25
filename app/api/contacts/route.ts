// ─────────────────────────────────────────────
// ShieldVault — /api/contacts Route Handler
//
// SECURITY AUDIT NOTES
// ─────────────────────
// Service role key bypasses RLS. Every query in this
// file MUST include .eq("user_id", userId) where userId
// comes from resolveUserId(). This is verified below.
//
// ISOLATION LINES (grep anchor: ISOLATION_ENFORCED):
//   GET  → line with .eq("user_id", userId)   [select]
//   POST → user_id field in insert payload      [insert]
//
// No query in this file touches the table without a
// user_id scope. There is no unscoped .select("*") or
// .delete() without the userId filter anywhere.
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, resolveUserId, AuthorizationError } from "@/lib/supabase";
import { checkRateLimit, extractIP } from "@/lib/ratelimit";
import type { ContactRecord, ContactLookupResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET — lookup contact by name ─────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Rate limit ───────────────────────────────
  const ip = extractIP(request);
  let rl;
  try {
    rl = await checkRateLimit(`contacts:${ip}`);
  } catch {
    rl = { success: true, limit: 20, remaining: 19, reset: 0 };
  }
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── Input validation ─────────────────────────
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "name query param is required (min 2 chars)" },
      { status: 400 }
    );
  }
  // Prevent wildcard-only queries that could be used as table scans
  if (name.replace(/%/g, "").length < 2) {
    return NextResponse.json(
      { error: "name contains insufficient searchable characters" },
      { status: 400 }
    );
  }

  // ── User isolation ───────────────────────────
  let userId: string;
  try {
    userId = await resolveUserId(request);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    console.error("[ShieldVault/contacts GET] resolveUserId failed:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // ── Database query — ISOLATION_ENFORCED ──────
  // .eq("user_id", userId) is the mandatory isolation filter.
  // Without it, service_role would return rows from ALL users.
  const supabase = getSupabaseServerClient();
  const { data: rawData, error } = await supabase
    .from("contacts")
    .select("id, user_id, name, phone, email, created_at")
    .eq("user_id", userId)           // ← ISOLATION_ENFORCED: scopes to this user only
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();

  // Cast explicitly — maybeSingle() can return unknown shape in strict TS
  const data = rawData as {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    email: string | null;
    created_at: string;
  } | null;

  if (error) {
    console.error("[ShieldVault/contacts GET] DB error:", error.message);
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

  // Explicit field projection — never return raw DB row wholesale
  const response: ContactLookupResponse = {
    found: true,
    contact: {
      id: data.id,
      user_id: data.user_id,
      name: data.name,
      phone: data.phone,
      email: data.email ?? undefined,
      created_at: data.created_at,
    } as ContactRecord,
  };
  return NextResponse.json(response);
}

// ── POST — create a contact ───────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Rate limit ───────────────────────────────
  const ip = extractIP(request);
  let rl;
  try {
    rl = await checkRateLimit(`contacts:${ip}`);
  } catch {
    rl = { success: true, limit: 20, remaining: 19, reset: 0 };
  }
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── User isolation ───────────────────────────
  let userId: string;
  try {
    userId = await resolveUserId(request);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    console.error("[ShieldVault/contacts POST] resolveUserId failed:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // ── Input validation ─────────────────────────
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

  // Sanitise phone — strip everything except digits, +, -, (), spaces
  const sanitisedPhone = phone.replace(/[^\d+\-()\s]/g, "").trim();
  if (sanitisedPhone.length < 7) {
    return NextResponse.json(
      { error: "phone number appears invalid (min 7 digits)" },
      { status: 400 }
    );
  }

  // Sanitise email if provided
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

  // ── Database insert — ISOLATION_ENFORCED ─────
  // user_id is hardcoded from resolveUserId() — the client
  // cannot supply or override it. Even if the request body
  // contains a user_id field, it is ignored entirely.
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      user_id: userId,               // ← ISOLATION_ENFORCED: server-resolved, not client-supplied
      name: name.trim(),
      phone: sanitisedPhone,
      email: sanitisedEmail,
    })
    .select("id, name, phone, email, created_at") // explicit projection — omit user_id from response
    .single();

  if (error) {
    console.error("[ShieldVault/contacts POST] DB insert error:", error.message);
    return NextResponse.json(
      {
        error: "Failed to save contact",
        // Only surface detail in development — never in production
        ...(process.env.NODE_ENV === "development" && { detail: error.message }),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, contact: data }, { status: 201 });
}

