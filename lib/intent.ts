// ─────────────────────────────────────────────
// ShieldVault — Client-Side Intent Detection
// Runs in the browser — NO API keys, pure regex
// Fast pre-classification before server round-trip
// ─────────────────────────────────────────────

import type { DetectedIntent, IntentType } from "@/types";

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  extractContact?: boolean;
  extractNote?: boolean;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: "call",
    extractContact: true,
    patterns: [
      /\b(?:call|phone|dial|ring|contact)\s+([a-zA-Z][\w\s]{1,30}?)(?:\s+(?:now|please|for me|asap))?\s*$/i,
      /\b(?:get|put)\s+(?:me\s+)?(?:through\s+to|in touch with)\s+([a-zA-Z][\w\s]{1,30})/i,
    ],
  },
  {
    type: "torch",
    patterns: [
      /\b(?:torch|flashlight|flash|light)\s*(?:on|off|toggle|activate|enable|disable)?\b/i,
      /\b(?:turn\s+(?:on|off)\s+(?:the\s+)?(?:torch|flashlight|light))\b/i,
      /\b(?:(?:torch|flashlight|light)\s+(?:on|off))\b/i,
    ],
  },
  {
    type: "lockdown",
    patterns: [
      /\b(?:lockdown|lock\s*down|lock\s+vault|secure\s+vault|security\s+mode)\b/i,
      /\b(?:activate|enable|trigger)\s+(?:lockdown|lock|security)\b/i,
    ],
  },
  {
    type: "note",
    extractNote: true,
    patterns: [
      /\b(?:note|jot|write\s+down|remember|remind me|log)\s+(?:that\s+)?(.+)/i,
      /\b(?:add\s+(?:a\s+)?note)\b/i,
    ],
  },
  {
    type: "calendar",
    patterns: [
      /\b(?:schedule|book|set\s+up|add\s+to\s+calendar|calendar|meeting|appointment|event)\b/i,
      /\b(?:what(?:'s|\s+is)\s+(?:on\s+)?(?:my\s+)?(?:schedule|calendar|agenda))\b/i,
      /\b(?:today|tomorrow|this\s+week|next\s+week)\s+(?:at\s+\d|schedule)\b/i,
    ],
  },
];


// ─────────────────────────────────────────────
// NOTE TAG EXTRACTOR
// Scans note body text for category keywords and
// returns a de-duplicated array of tag strings.
// Tags are stored in Supabase notes.tags column.
// ─────────────────────────────────────────────

const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "schedule",   pattern: /\b(?:meeting|appointment|call|event|session|at\s+\d|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i },
  { tag: "task",       pattern: /\b(?:todo|to-do|task|must|need to|have to|action|follow up|follow-up|deadline)\b/i },
  { tag: "idea",       pattern: /\b(?:idea|concept|thought|brainstorm|consider|maybe|what if|proposal)\b/i },
  { tag: "contact",    pattern: /\b(?:call|email|message|text|speak to|talk to|reach out|get in touch)\b/i },
  { tag: "finance",    pattern: /\b(?:pay|payment|invoice|expense|cost|budget|money|transfer|send|receive|bill)\b/i },
  { tag: "personal",   pattern: /\b(?:family|friend|home|health|doctor|gym|diet|exercise|sleep|personal)\b/i },
  { tag: "work",       pattern: /\b(?:project|client|deadline|report|presentation|sprint|standup|review|launch|deploy)\b/i },
  { tag: "urgent",     pattern: /\b(?:urgent|asap|immediately|critical|emergency|now|right away)\b/i },
];

function extractNoteTags(body: string): string[] {
  const matched = TAG_RULES
    .filter(({ pattern }) => pattern.test(body))
    .map(({ tag }) => tag);

  // Deduplicate and cap at 5 auto-tags
  return [...new Set(matched)].slice(0, 5);
}

export function detectIntent(query: string): DetectedIntent {
  const trimmed = query.trim();

  for (const { type, patterns, extractContact, extractNote } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const intent: DetectedIntent = {
          type,
          rawQuery: trimmed,
          confidence: 0.9,
        };

        if (extractContact && match[1]) {
          intent.contactName = match[1].trim();
        }

        if (extractNote) {
          // match[1] captures everything after the trigger word (e.g. "note that X" → "X")
          // If group 1 is empty (e.g. bare "add a note"), fall back to full raw query
          const body = (match[1] ?? trimmed).trim();
          intent.noteContent = body;
          // Auto-tag: extract known category keywords from the note body
          intent.noteTags = extractNoteTags(body);
        }

        return intent;
      }
    }
  }

  return {
    type: "general",
    rawQuery: trimmed,
    confidence: 1.0,
  };
}

// Quick boolean helpers used in the UI
export const isCallIntent = (q: string) => detectIntent(q).type === "call";
export const isTorchIntent = (q: string) => detectIntent(q).type === "torch";
export const isLockdownIntent = (q: string) =>
  detectIntent(q).type === "lockdown";
