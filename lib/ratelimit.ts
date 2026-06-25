// ─────────────────────────────────────────────
// ShieldVault — Upstash Rate Limiter
// Strategy: Sliding window, per IP
// Limit: 20 requests per 60 seconds
// ─────────────────────────────────────────────

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily instantiated — avoids build-time errors if env vars
// aren't set during Next.js static analysis
let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit {
  if (_ratelimit) return _ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env.local"
    );
  }

  const redis = new Redis({ url, token });

  _ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    analytics: true,
    prefix: "shieldvault:ratelimit",
  });

  return _ratelimit;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp ms
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const ratelimit = getRatelimit();
  const identifier = `ip:${ip}`;
  const result = await ratelimit.limit(identifier);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// Helper: extract real IP from Next.js request headers
export function extractIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP.trim();
  }
  // Fallback for local dev
  return "127.0.0.1";
}
