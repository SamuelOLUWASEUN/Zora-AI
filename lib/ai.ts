// ─────────────────────────────────────────────
// Zora — AI Provider Abstraction
// Supports: Groq (default) | Gemini
// Switch via: AI_PROVIDER=groq|gemini in .env.local
// NO keys ever exposed to client — server-only
// ─────────────────────────────────────────────

import type { AIProvider } from "@/types";

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderResponse {
  text: string;
  provider: AIProvider;
  latencyMs: number;
}

// ── System prompt — defines Zora's concierge persona ──
const SYSTEM_PROMPT = `You are Zora, a privacy-first personal AI concierge. 
You run on-device context: the user's contacts, calendar events, and notes stay local and private.
You are terse, precise, and executive in tone — like a senior EA who wastes no words.
You can help with: scheduling, notes, calling contacts, setting reminders, quick answers, and device actions.
When a user says "call [name]", confirm the intent clearly.
When a user says "torch" or "flashlight", confirm you're activating it.
Never expose technical implementation details. Respond in 1-3 sentences max unless a longer answer is explicitly needed.
If asked about security or privacy, emphasise: all personal data stays on-device.`;

// ─────────────────────────────────────────────
// GROQ
// ─────────────────────────────────────────────

async function callGroq(
  messages: ProviderMessage[]
): Promise<ProviderResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const start = Date.now();

  const payload = {
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ],
    max_tokens: 512,
    temperature: 0.6,
    stream: false,
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string =
    data.choices?.[0]?.message?.content ?? "No response from Groq.";

  return { text: text.trim(), provider: "groq", latencyMs: Date.now() - start };
}

// ─────────────────────────────────────────────
// GEMINI
// ─────────────────────────────────────────────

async function callGemini(
  messages: ProviderMessage[]
): Promise<ProviderResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const start = Date.now();

  // Gemini uses a different message format — convert from OpenAI-style
  const geminiContents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.6,
    },
  };

  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response from Gemini.";

  return {
    text: text.trim(),
    provider: "gemini",
    latencyMs: Date.now() - start,
  };
}

// ─────────────────────────────────────────────
// PROVIDER ROUTER — single entry point
// ─────────────────────────────────────────────

export async function callAI(
  messages: ProviderMessage[]
): Promise<ProviderResponse> {
  const provider = (process.env.AI_PROVIDER ?? "groq") as AIProvider;

  switch (provider) {
    case "gemini":
      return callGemini(messages);
    case "groq":
    default:
      return callGroq(messages);
  }
}

export function getActiveProvider(): AIProvider {
  return (process.env.AI_PROVIDER ?? "groq") as AIProvider;
}
