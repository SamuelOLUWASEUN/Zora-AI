// ─────────────────────────────────────────────
// Zora — /api/notes Route Handler
//
// GET    /api/notes              → list user notes (newest first, pinned top)
// POST   /api/notes              → create note from AI agent or manual input
// PATCH  /api/notes?id=<uuid>    → update content, tags, or pin status
// DELETE /api/notes?id=<uuid>    → delete a specific note
//
// SECURITY MODEL
// ──────────────
// - middleware.ts blocks unauthenticated requests before this runs
// - resolveUserId() extracts + verifies the JWT on every request
// - Every query has .eq("user_id", userId) — tagged ISOLATION_ENFORCED
// - No query touches the table without the user_id scope
// - user_id is NEVER accepted from the request body
// - Service role key is used so anon-session users can write
//   (RLS would block anon key writes for anon users without custom policies)
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  resolveUserId,
  AuthorizationError,
} from "@/lib/supabase";
import { checkRateLimit, extractIP } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Shared auth + rate limit guard ───────────
// Runs at the top of every method handler.
// Returns { userId } or a NextResponse error to return early.

type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

async function authenticate(
  request: NextRequest,
  rateLimitKey: string
): Promise<AuthResult> {
  const ip = extractIP(request);
  let rl;
  try {
    rl = await checkRateLimit(`notes:${rateLimitKey}:${ip}`);
  } catch {
    rl = { success: true, limit: 20, remaining: 19, reset: 0 };
  }
  if (!rl.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", message: "Too many requests." },
        { status: 429 }
      ),
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

// ── GET — list notes ─────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "get");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const tag = searchParams.get("tag")?.trim();
  const pinned = searchParams.get("pinned");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;

  let query = supabase
    .from("notes")
    .select("id, content, tags, pinned, created_at, updated_at")
    .eq("user_id", userId)           // ← ISOLATION_ENFORCED
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  // Optional filters
  if (tag) {
    query = query.contains("tags", [tag]);
  }
  if (pinned === "true") {
    query = query.eq("pinned", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Zora/notes GET] DB error:", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve notes" },
      { status: 500 }
    );
  }

  return NextResponse.json({ notes: data ?? [], count: data?.length ?? 0 });
}

// ── POST — create note ───────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "post");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: {
    content?: unknown;
    tags?: unknown;
    pinned?: unknown;
    source?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate content
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 }
    );
  }
  if (body.content.length > 10_000) {
    return NextResponse.json(
      { error: "content exceeds maximum length of 10,000 characters" },
      { status: 400 }
    );
  }

  // Validate tags (optional array of strings)
  let tags: string[] = [];
  if (body.tags !== undefined) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.some((t) => typeof t !== "string")
    ) {
      return NextResponse.json(
        { error: "tags must be an array of strings" },
        { status: 400 }
      );
    }
    tags = (body.tags as string[])
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, 20); // hard cap: 20 tags per note
  }

  // Validate pinned (optional boolean)
  const pinned =
    body.pinned === true || body.pinned === "true" ? true : false;

  // Sanitise source — only used for internal logging
  const source =
    typeof body.source === "string" && ["agent", "manual", "voice"].includes(body.source)
      ? body.source
      : "manual";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,               // ← ISOLATION_ENFORCED: server-resolved only
      content: body.content.trim(),
      tags,
      pinned,
    })
    .select("id, content, tags, pinned, created_at, updated_at")
    .single();

  if (error) {
    console.error("[Zora/notes POST] DB insert error:", error.message);
    return NextResponse.json(
      {
        error: "Failed to create note",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  console.info(
    `[Zora/notes] Created note ${data.id} via ${source} for user ${userId.slice(0, 8)}…`
  );

  return NextResponse.json({ success: true, note: data }, { status: 201 });
}

// ── PATCH — update note ──────────────────────
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "patch");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get("id")?.trim();

  if (!noteId) {
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 }
    );
  }

  // Validate UUID format — prevent injection via path param
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(noteId)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  let body: { content?: unknown; tags?: unknown; pinned?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build update payload — only accept known fields
  const update: { content?: string; tags?: string[]; pinned?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json({ error: "content must be a non-empty string" }, { status: 400 });
    }
    if (body.content.length > 10_000) {
      return NextResponse.json({ error: "content exceeds 10,000 character limit" }, { status: 400 });
    }
    update.content = body.content.trim();
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    update.tags = (body.tags as string[])
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, 20);
  }

  if (body.pinned !== undefined) {
    update.pinned = body.pinned === true || body.pinned === "true";
  }

  if (Object.keys(update).length === 1) {
    // Only updated_at was set — no real update requested
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;
  const { data, error } = await supabase
    .from("notes")
    .update(update)
    .eq("id", noteId)
    .eq("user_id", userId)           // ← ISOLATION_ENFORCED: user cannot edit other users' notes
    .select("id, content, tags, pinned, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[Zora/notes PATCH] DB update error:", error.message);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }

  if (!data) {
    // Note not found OR belongs to different user — return same 404 either way
    // (do not reveal whether the note exists for a different user)
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, note: data });
}

// ── DELETE — remove note ─────────────────────
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request, "delete");
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get("id")?.trim();

  if (!noteId) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(noteId)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any;
  const { error, count } = await supabase
    .from("notes")
    .delete({ count: "exact" })
    .eq("id", noteId)
    .eq("user_id", userId);          // ← ISOLATION_ENFORCED: user cannot delete other users' notes

  if (error) {
    console.error("[Zora/notes DELETE] DB error:", error.message);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, deleted: noteId });
}
