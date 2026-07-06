// ─────────────────────────────────────────────
// Zora — Shared Type System
// ─────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";
export type LockdownState = "active" | "inactive";
export type VoiceState = "idle" | "listening" | "processing" | "error";
export type AIProvider = "groq" | "gemini";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isVoiceInput?: boolean;
  provider?: AIProvider;
  latencyMs?: number;
}

export interface ContactRecord {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email?: string;
  created_at: string;
}

export interface AgentRequest {
  query: string;
  conversationHistory?: Array<{ role: MessageRole; content: string }>;
}

export interface AgentResponse {
  reply: string;
  provider: AIProvider;
  latencyMs: number;
  intent?: DetectedIntent;
}

export type IntentType =
  | "call"
  | "note"
  | "calendar"
  | "torch"
  | "lockdown"
  | "general";

export interface DetectedIntent {
  type: IntentType;
  contactName?: string;
  noteContent?: string;   // extracted body text for note intent
  noteTags?: string[];    // auto-detected tags from note body
  rawQuery: string;
  confidence: number;
}

export interface ContactLookupResponse {
  found: boolean;
  contact?: ContactRecord;
  error?: string;
}

// Rate limit error shape
export interface RateLimitError {
  error: "rate_limited";
  message: string;
  retryAfterMs: number;
}

// ─────────────────────────────────────────────
// Phase 2 — Voice Engine shared types
// ─────────────────────────────────────────────

// Callback signature for handleSend lifted from ChatInterface
export type HandleSendFn = (overrideText?: string) => Promise<void>;

// Callback signature for detectIntent (from lib/intent.ts)
export type DetectIntentFn = (query: string) => DetectedIntent;

// Callback for torch toggle (async — may trigger getUserMedia)
export type ToggleTorchFn = () => Promise<void>;

// Callback for lockdown toggle (synchronous dispatch)
export type ToggleLockdownFn = () => void;

// Props interface for VoiceActivationController
export interface VoiceControllerProps {
  onHandleSend: HandleSendFn;
  onDetectIntent: DetectIntentFn;
  onToggleTorch: ToggleTorchFn;
  onToggleLockdown: ToggleLockdownFn;
  isLocked: boolean;
}

// State machine phases for the wake-word loop
export type WakeWordPhase =
  | "idle"           // listening for wake word only
  | "wake_detected"  // wake word just fired — chime played
  | "capturing"      // capturing the command utterance
  | "processing";    // command sent to pipeline
