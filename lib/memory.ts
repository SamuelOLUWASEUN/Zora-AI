"use client";

// ─────────────────────────────────────────────
// Zora — Vault Memory
// Private, session-aware AI memory layer.
// Stores structured facts extracted from conversation.
// 100% client-side — IndexedDB only. Zero server calls.
// Facts are auto-injected as context prefix on every prompt.
// ─────────────────────────────────────────────

export interface MemoryFact {
  id: string;
  content: string;        // e.g. "User has a meeting Tuesday at 3pm"
  category: string;       // "schedule" | "preference" | "contact" | "task" | "general"
  confidence: number;     // 0–1
  createdAt: number;      // Unix ms
  lastUsed: number;       // Unix ms — for recency scoring
  useCount: number;
}

const DB_NAME = "zora-memory";
const DB_VERSION = 1;
const STORE_NAME = "facts";
const MAX_FACTS = 50;       // Hard cap — keeps IndexedDB lean
const INJECT_LIMIT = 5;     // Max facts injected per prompt

// ─────────────────────────────────────────────
// DB INIT
// ─────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("lastUsed", "lastUsed");
        store.createIndex("category", "category");
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────
// CRUD OPERATIONS
// ─────────────────────────────────────────────

export async function getAllFacts(): Promise<MemoryFact[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as MemoryFact[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveFact(fact: Omit<MemoryFact, "id" | "createdAt" | "lastUsed" | "useCount">): Promise<void> {
  try {
    const db = await openDB();
    const all = await getAllFacts();

    // Deduplicate: skip if very similar content already exists
    const isDuplicate = all.some(
      (f) =>
        f.category === fact.category &&
        similarity(f.content, fact.content) > 0.8
    );
    if (isDuplicate) return;

    // Evict oldest if over cap
    if (all.length >= MAX_FACTS) {
      const oldest = all.sort((a, b) => a.lastUsed - b.lastUsed)[0];
      await deleteFact(oldest.id);
    }

    const newFact: MemoryFact = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: fact.content,
      category: fact.category,
      confidence: fact.confidence,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 0,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).add(newFact);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Memory failures must never crash the app
    console.warn("[VaultMemory] saveFact failed silently:", err);
  }
}

export async function deleteFact(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silent
  }
}

export async function clearAllFacts(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silent
  }
}

async function updateLastUsed(id: string): Promise<void> {
  try {
    const db = await openDB();
    const fact = await new Promise<MemoryFact>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!fact) return;

    const updated: MemoryFact = {
      ...fact,
      lastUsed: Date.now(),
      useCount: fact.useCount + 1,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silent
  }
}

// ─────────────────────────────────────────────
// CONTEXT INJECTION
// Returns a compact context string to prepend to
// the system prompt for each AI call.
// ─────────────────────────────────────────────

export async function buildMemoryContext(currentQuery: string): Promise<string> {
  try {
    const all = await getAllFacts();
    if (all.length === 0) return "";

    // Score facts by relevance to current query + recency + frequency
    const now = Date.now();
    const scored = all.map((fact) => {
      const ageScore = 1 - Math.min((now - fact.lastUsed) / (7 * 24 * 60 * 60 * 1000), 1); // decay over 7 days
      const freqScore = Math.min(fact.useCount / 10, 1);
      const relevanceScore = queryRelevance(currentQuery, fact.content);
      const total = relevanceScore * 0.6 + ageScore * 0.3 + freqScore * 0.1;
      return { fact, score: total };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, INJECT_LIMIT)
      .map(({ fact }) => fact);

    // Mark as used
    for (const fact of top) {
      updateLastUsed(fact.id); // fire-and-forget
    }

    if (top.length === 0) return "";

    const lines = top.map((f) => `- [${f.category}] ${f.content}`).join("\n");
    return `\n\nUser context (private, on-device memory):\n${lines}`;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// MEMORY EXTRACTION
// Called after each AI response to silently mine
// new facts from the conversation turn.
// ─────────────────────────────────────────────

export async function extractAndSaveFacts(
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const combined = `${userMessage} ${assistantReply}`.toLowerCase();

  const extractors: Array<{
    category: string;
    patterns: RegExp[];
    extract: (match: RegExpMatchArray, original: string) => string;
  }> = [
    {
      category: "schedule",
      patterns: [
        /\b(?:meeting|appointment|call|event|session)\b.{0,40}\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i,
        /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,20}\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
        /\bschedule[d]?\b.{0,40}\b(?:at|on|for)\b/i,
      ],
      extract: (_, original) => `Scheduled event: "${original.slice(0, 80)}"`,
    },
    {
      category: "preference",
      patterns: [
        /\bi\s+(?:prefer|like|love|hate|dislike|always|never)\s+(.{5,40})/i,
        /\bmy\s+(?:preferred|favourite|favorite)\s+(.{3,30})\s+is\s+(.{3,30})/i,
      ],
      extract: (match) => `User preference: ${match[0].slice(0, 80)}`,
    },
    {
      category: "contact",
      patterns: [
        /\bmy\s+(?:boss|manager|colleague|friend|partner|wife|husband|doctor|dentist)\s+is\s+([a-zA-Z\s]{2,30})/i,
        /\b([a-zA-Z]{2,20})'s?\s+(?:number|phone|email)\s+is\b/i,
      ],
      extract: (match) => `Contact info: ${match[0].slice(0, 80)}`,
    },
    {
      category: "task",
      patterns: [
        /\bi\s+(?:need to|have to|must|should|want to)\s+(.{5,50})/i,
        /\bremind\s+(?:me\s+)?(?:to\s+)?(.{5,50})/i,
      ],
      extract: (match) => `Task noted: ${match[1]?.slice(0, 80) ?? match[0].slice(0, 80)}`,
    },
  ];

  for (const { category, patterns, extract } of extractors) {
    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        const content = extract(match, match[0]);
        await saveFact({ content, category, confidence: 0.75 });
        break; // One fact per category per turn
      }
    }
  }
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

// Rough Jaccard-style word overlap similarity (0–1)
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = Array.from(wordsA).filter((w) => wordsB.has(w)).length;
  const union = new Set(Array.from(wordsA).concat(Array.from(wordsB))).size;
  return union === 0 ? 0 : intersection / union;
}

// Relevance score between query and stored fact (0–1)
function queryRelevance(query: string, factContent: string): number {
  return similarity(query, factContent);
}
