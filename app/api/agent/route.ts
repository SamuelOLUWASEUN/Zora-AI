// ─────────────────────────────────────────────
// ShieldVault — /api/agent Route Handler
// POST /api/agent
// Protected by: Upstash sliding-window rate limit (IP)
// AI: Provider-agnostic (Groq default, Gemini fallback)
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { callAI, getActiveProvider } from "@/lib/ai";
import { checkRateLimit, extractIP } from "@/lib/ratelimit";
import type { AgentRequest, AgentResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Rate limit check ──────────────────────
  const ip = extractIP(request);

  let rateLimitResult;
  try {
    rateLimitResult = await checkRateLimit(ip);
  } catch (err) {
    // If Upstash is misconfigured, fail open in dev, fail closed in prod
    if (process.env.NODE_ENV === "production") {
      console.error("[ShieldVault] Rate limiter unavailable:", err);
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }
    // Dev: continue without rate limiting
    rateLimitResult = { success: true, limit: 20, remaining: 19, reset: 0 };
  }

  if (!rateLimitResult.success) {
    const retryAfterMs = rateLimitResult.reset - Date.now();
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many requests. Please wait before sending again.",
        retryAfterMs: Math.max(retryAfterMs, 0),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
          "X-RateLimit-Limit": String(rateLimitResult.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimitResult.reset),
        },
      }
    );
  }

  // ── 2. Parse + validate request body ────────
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const { query, conversationHistory = [] } = body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json(
      { error: "query field is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (query.length > 2000) {
    return NextResponse.json(
      { error: "query exceeds maximum length of 2000 characters" },
      { status: 400 }
    );
  }

  // ── 3. Build message history for the AI ─────
  const messages = [
    // Include up to last 10 turns for context (keep tokens lean on free tier)
    ...conversationHistory.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: query.trim() },
  ];

  // ── 4. Call AI provider ──────────────────────
  let aiResult;
  try {
    aiResult = await callAI(messages);
  } catch (err) {
    console.error("[ShieldVault] AI provider error:", err);

    const errorMessage =
      err instanceof Error ? err.message : "Unknown AI error";

    // Surface a structured error — never expose raw API error to client
    return NextResponse.json(
      {
        error: "ai_error",
        message: "The AI service is temporarily unavailable. Try again shortly.",
        detail:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 502 }
    );
  }

  // ── 5. Return structured response ───────────
  const response: AgentResponse = {
    reply: aiResult.text,
    provider: aiResult.provider,
    latencyMs: aiResult.latencyMs,
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      "X-RateLimit-Limit": String(rateLimitResult.limit),
      "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      "X-Provider": getActiveProvider(),
      "Cache-Control": "no-store",
    },
  });
}

// Reject non-POST methods cleanly
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 }
  );
}
