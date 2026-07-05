"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useReducer,
} from "react";
import dynamic from "next/dynamic";
import {
  buildMemoryContext,
  extractAndSaveFacts,
  getAllFacts,
  clearAllFacts,
  type MemoryFact,
} from "@/lib/memory";
import { detectIntent } from "@/lib/intent";
import { speakResponse } from "@/lib/audio-effects";
import type { HandleSendFn, ToggleTorchFn, ToggleLockdownFn } from "@/types";

// Lazy-load ContactImporter — only mounts when needed
const ContactImporter = dynamic(() => import("./ContactImporter"), {
  ssr: false,
});

// Lazy-load PrivacyFilter — client-only (pointer/touch events)
const PrivacyFilter = dynamic(() => import("./PrivacyFilter"), {
  ssr: false,
});

// Lazy-load VoiceActivationController — heavy audio + speech APIs
const VoiceActivationController = dynamic(
  () => import("./VoiceActivationController"),
  { ssr: false }
);

// ─────────────────────────────────────────────
// TYPE SYSTEM
// ─────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";
export type LockdownState = "active" | "inactive";
export type VoiceState = "idle" | "listening" | "processing" | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isVoiceInput?: boolean;
  provider?: string;
  latencyMs?: number;
}

interface ChatState {
  messages: ChatMessage[];
  voiceState: VoiceState;
  interimTranscript: string;
  lockdown: LockdownState;
  isAgentProcessing: boolean;
  dialIntent: { name: string; number: string } | null;
  torchActive: boolean;
  torchError: string | null;
  showContactImporter: boolean;
  showMemoryPanel: boolean;
  memoryFacts: MemoryFact[];
  privacyActive: boolean;
}

type ChatAction =
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | { type: "SET_VOICE_STATE"; payload: VoiceState }
  | { type: "SET_INTERIM"; payload: string }
  | { type: "CLEAR_INTERIM" }
  | { type: "TOGGLE_LOCKDOWN" }
  | { type: "SET_PROCESSING"; payload: boolean }
  | { type: "SET_DIAL_INTENT"; payload: { name: string; number: string } | null }
  | { type: "SET_TORCH"; payload: boolean }
  | { type: "SET_TORCH_ERROR"; payload: string | null }
  | { type: "TOGGLE_CONTACT_IMPORTER" }
  | { type: "TOGGLE_MEMORY_PANEL" }
  | { type: "SET_MEMORY_FACTS"; payload: MemoryFact[] }
  | { type: "TOGGLE_PRIVACY" };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_VOICE_STATE":
      return { ...state, voiceState: action.payload };
    case "SET_INTERIM":
      return { ...state, interimTranscript: action.payload };
    case "CLEAR_INTERIM":
      return { ...state, interimTranscript: "" };
    case "TOGGLE_LOCKDOWN":
      return {
        ...state,
        lockdown: state.lockdown === "active" ? "inactive" : "active",
      };
    case "SET_PROCESSING":
      return { ...state, isAgentProcessing: action.payload };
    case "SET_DIAL_INTENT":
      return { ...state, dialIntent: action.payload };
    case "SET_TORCH":
      return { ...state, torchActive: action.payload, torchError: null };
    case "SET_TORCH_ERROR":
      return { ...state, torchError: action.payload };
    case "TOGGLE_CONTACT_IMPORTER":
      return { ...state, showContactImporter: !state.showContactImporter };
    case "TOGGLE_MEMORY_PANEL":
      return { ...state, showMemoryPanel: !state.showMemoryPanel };
    case "SET_MEMORY_FACTS":
      return { ...state, memoryFacts: action.payload };
    case "TOGGLE_PRIVACY":
      return { ...state, privacyActive: !state.privacyActive };
    default:
      return state;
  }
}

const initialState: ChatState = {
  messages: [
    {
      id: "sys-welcome",
      role: "system",
      content: "ZORA ONLINE",
      timestamp: new Date(),
    },
    {
      id: "sys-intro",
      role: "assistant",
      content:
        "Your vault is ready. Everything you share stays private — your notes, contacts, and context never leave your device session.\n\nHere's what I can do right now:",
      timestamp: new Date(),
    },
    {
      id: "sys-cmd-1",
      role: "assistant",
      content: "→  Say or type \"Note that [anything]\" — I'll save it to your private vault instantly.",
      timestamp: new Date(),
    },
    {
      id: "sys-cmd-2",
      role: "assistant",
      content: "→  Say \"Call [name]\" — I'll find their number and confirm before dialling.",
      timestamp: new Date(),
    },
    {
      id: "sys-cmd-3",
      role: "assistant",
      content: '→  Tap LOCK in the header to seal the vault. No prompts get through.',
      timestamp: new Date(),
    },
    {
      id: "sys-cmd-4",
      role: "assistant",
      content: '→  Tap ◉ for Privacy Filter — blurs your screen. Only you can read it.',
      timestamp: new Date(),
    },
    {
      id: "sys-cmd-5",
      role: "assistant",
      content: "→  Toggle Hands-Free below and say \"Hey Zora\" — I'll listen and respond.",
      timestamp: new Date(),
    },
    {
      id: "sys-ready",
      role: "assistant",
      content: "What do you need?",
      timestamp: new Date(),
    },
  ],
  voiceState: "idle",
  interimTranscript: "",
  lockdown: "inactive",
  isAgentProcessing: false,
  dialIntent: null,
  torchActive: false,
  torchError: null,
  showContactImporter: false,
  showMemoryPanel: false,
  memoryFacts: [],
  privacyActive: false,
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─────────────────────────────────────────────
// SVG ICONS
// ─────────────────────────────────────────────

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      {locked ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      )}
    </svg>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {active && (
        <circle cx="12" cy="7" r="2" fill="currentColor" opacity="0.6">
          <animate attributeName="r" values="2;4;2" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function DialOverlay({
  intent, onConfirm, onDismiss,
}: {
  intent: { name: string; number: string };
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={overlayStyles.backdrop} role="dialog" aria-modal="true" aria-label="Confirm call">
      <div style={overlayStyles.panel}>
        <div style={overlayStyles.eyebrow}>OUTBOUND CALL</div>
        <div style={overlayStyles.name}>{intent.name}</div>
        <div style={overlayStyles.number}>{intent.number}</div>
        <div style={overlayStyles.actions}>
          <button style={overlayStyles.dismissBtn} onClick={onDismiss} aria-label="Cancel call">Cancel</button>
          <button style={overlayStyles.confirmBtn} onClick={onConfirm} aria-label={`Call ${intent.name}`}>Call now</button>
        </div>
      </div>
    </div>
  );
}

function ProcessingIndicator() {
  return (
    <div style={styles.processingRow} aria-live="polite" aria-label="Processing">
      <span style={styles.processingLabel}>Processing</span>
      <span style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ ...styles.dot, animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div style={{ ...styles.messageRow, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <div style={styles.agentBadge} aria-label="ShieldVault agent">SV</div>
      )}
      <div style={{
        ...styles.bubble,
        ...(isUser ? styles.userBubble : styles.agentBubble),
        ...(isSystem ? styles.systemBubble : {}),
      }}>
        {isSystem && <div style={styles.systemLabel}>SYSTEM</div>}
        <p style={isSystem ? styles.systemText : styles.bubbleText}>{message.content}</p>
        <time style={styles.timestamp} dateTime={message.timestamp.toISOString()}>
          {formatTime(message.timestamp)}
          {message.isVoiceInput && <span style={styles.voiceBadge} aria-label="Voice input"> · MIC</span>}
          {message.provider && (
            <span style={styles.providerBadge}> · {message.provider.toUpperCase()}</span>
          )}
          {message.latencyMs && (
            <span style={styles.latencyBadge}> {message.latencyMs}ms</span>
          )}
        </time>
      </div>
    </div>
  );
}

function MemoryPanel({
  facts, onClear, onClose,
}: {
  facts: MemoryFact[];
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div style={overlayStyles.backdrop} role="dialog" aria-modal="true" aria-label="Vault memory">
      <div style={{ ...overlayStyles.panel, maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={overlayStyles.eyebrow}>VAULT MEMORY</div>
            <div style={{ ...overlayStyles.name, fontSize: "18px" }}>
              On-Device Context
            </div>
            <div style={{ fontFamily: TOKEN.fontMono, fontSize: "10px", color: TOKEN.textDim, marginTop: "2px" }}>
              {facts.length} fact{facts.length !== 1 ? "s" : ""} stored locally · never sent to server
            </div>
          </div>
          <button style={overlayStyles.dismissBtn} onClick={onClose} aria-label="Close memory panel"
            >✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {facts.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontFamily: TOKEN.fontMono, fontSize: "11px", color: TOKEN.textDim }}>
              No memory yet. Start chatting and ShieldVault will learn your context.
            </div>
          ) : (
            facts.map((fact) => (
              <div key={fact.id} style={{
                padding: "10px 12px",
                border: `1px solid ${TOKEN.border}`,
                borderLeft: `2px solid ${TOKEN.green}`,
                borderRadius: TOKEN.radius,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}>
                <div style={{ fontFamily: TOKEN.fontMono, fontSize: "8px", color: TOKEN.green, letterSpacing: "0.12em" }}>
                  {fact.category.toUpperCase()} · used {fact.useCount}×
                </div>
                <div style={{ fontSize: "13px", color: TOKEN.textPrimary, lineHeight: 1.4 }}>
                  {fact.content}
                </div>
              </div>
            ))
          )}
        </div>

        {facts.length > 0 && (
          <button
            style={{ ...overlayStyles.dismissBtn, marginTop: "16px", width: "100%", color: TOKEN.red, borderColor: "rgba(239,68,68,0.3)" }}
            onClick={onClear}
          >
            Clear all memory
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function ChatInterface() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [inputText, setInputText] = useState("");
  const [showVoiceTooltip, setShowVoiceTooltip] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null); // types from types/speech.d.ts
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  const torchStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-scroll ──────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.interimTranscript, state.isAgentProcessing]);

  // ── Cleanup on unmount ───────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      torchStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // ── Load memory on mount ─────────────────────
  useEffect(() => {
    getAllFacts().then((facts) => {
      dispatch({ type: "SET_MEMORY_FACTS", payload: facts });
    });
  }, []);

  // ── First-run voice tooltip ───────────────────
  // Shows once, stored in localStorage so it never repeats
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("zora_voice_tooltip_dismissed");
      if (!dismissed) {
        // Delay so it appears after the onboarding messages settle
        const t = setTimeout(() => setShowVoiceTooltip(true), 2200);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable (private mode) — skip silently
    }
  }, []);

  const dismissVoiceTooltip = useCallback(() => {
    setShowVoiceTooltip(false);
    try {
      localStorage.setItem("zora_voice_tooltip_dismissed", "1");
    } catch {
      // Silent
    }
  }, []);

  // ── Speech Recognition ───────────────────────
  const startVoice = useCallback(() => {
    if (state.lockdown === "active") return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      dispatch({ type: "SET_VOICE_STATE", payload: "error" });
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: generateId(), role: "system",
          content: "Voice input not supported in this browser. Use Chrome or Edge.",
          timestamp: new Date(),
        },
      });
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      dispatch({ type: "SET_VOICE_STATE", payload: "listening" });
      dispatch({ type: "CLEAR_INTERIM" });
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) dispatch({ type: "SET_INTERIM", payload: interim });
      if (final) {
        dispatch({ type: "CLEAR_INTERIM" });
        setInputText(final.trim());
      }
    };

    recognition.onend = () => {
      dispatch({ type: "SET_VOICE_STATE", payload: "idle" });
      dispatch({ type: "CLEAR_INTERIM" });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Suppress aborted — fires on manual stop, not a real error
      if (event.error === "aborted") {
        dispatch({ type: "SET_VOICE_STATE", payload: "idle" });
        return;
      }
      dispatch({ type: "SET_VOICE_STATE", payload: "error" });
      dispatch({ type: "CLEAR_INTERIM" });
      const errorMessages: Record<string, string> = {
        "not-allowed": "Microphone access denied. Check browser permissions.",
        "no-speech": "No speech detected. Try again.",
        network: "Network error during voice capture.",
      };
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: generateId(), role: "system",
          content: errorMessages[event.error] ?? `Voice error: ${event.error}`,
          timestamp: new Date(),
        },
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [state.lockdown]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    dispatch({ type: "SET_VOICE_STATE", payload: "idle" });
  }, []);

  // ── Torch control ────────────────────────────
  const toggleTorch = useCallback(async () => {
    const triggerFlash = () => {
      dispatch({ type: "SET_TORCH", payload: true });
      flashTimeoutRef.current = setTimeout(() => {
        dispatch({ type: "SET_TORCH", payload: false });
      }, 3000);
    };

    if (state.torchActive) {
      try {
        await torchTrackRef.current?.applyConstraints({
          advanced: [{ torch: false } as MediaTrackConstraintSet],
        });
      } catch { /* silent */ }
      torchStreamRef.current?.getTracks().forEach((t) => t.stop());
      torchTrackRef.current = null;
      torchStreamRef.current = null;
      dispatch({ type: "SET_TORCH", payload: false });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("No video track available");
      await track.applyConstraints({
        advanced: [{ torch: true } as MediaTrackConstraintSet],
      });
      torchTrackRef.current = track;
      torchStreamRef.current = stream;
      dispatch({ type: "SET_TORCH", payload: true });
    } catch {
      dispatch({
        type: "SET_TORCH_ERROR",
        payload: "Hardware torch overridden by browser policy — screen flash active",
      });
      triggerFlash();
    }
  }, [state.torchActive]);

  // ── Send message ─────────────────────────────
  const handleSend = useCallback(
    async (overrideText?: string) => {
      const raw = (overrideText ?? inputText).trim();
      if (!raw) return;

      // ── LOCKDOWN GUARD — short-circuits before ANY network call ──
      if (state.lockdown === "active") {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: generateId(), role: "system",
            content: "Security clearance revoked. Please re-authenticate via Supabase Auth.",
            timestamp: new Date(),
          },
        });
        setInputText("");
        return;
      }

      const userMessage: ChatMessage = {
        id: generateId(), role: "user", content: raw,
        timestamp: new Date(), isVoiceInput: state.voiceState !== "idle",
      };
      dispatch({ type: "ADD_MESSAGE", payload: userMessage });
      setInputText("");
      dispatch({ type: "SET_PROCESSING", payload: true });

      // ── INTENT DETECTION (client-side, zero network) ──
      const intent = detectIntent(raw);

      // ── TORCH INTENT ──
      if (intent.type === "torch") {
        dispatch({ type: "SET_PROCESSING", payload: false });
        await toggleTorch();
        return;
      }

      // ── LOCKDOWN INTENT ──
      if (intent.type === "lockdown") {
        dispatch({ type: "SET_PROCESSING", payload: false });
        dispatch({ type: "TOGGLE_LOCKDOWN" });
        return;
      }

      // ── CALL INTENT — real /api/contacts lookup ──
      if (intent.type === "call" && intent.contactName) {
        try {
          const res = await fetch(
            `/api/contacts?name=${encodeURIComponent(intent.contactName)}`
          );

          dispatch({ type: "SET_PROCESSING", payload: false });

          if (res.status === 404) {
            dispatch({
              type: "ADD_MESSAGE",
              payload: {
                id: generateId(), role: "system",
                content: `No contact found for "${intent.contactName}". Add them via the Contacts button.`,
                timestamp: new Date(),
              },
            });
            return;
          }

          if (!res.ok) throw new Error(`Contact lookup failed: ${res.status}`);

          const data = await res.json();
          if (data.found && data.contact) {
            dispatch({
              type: "SET_DIAL_INTENT",
              payload: { name: data.contact.name, number: data.contact.phone },
            });
          }
        } catch (err) {
          dispatch({ type: "SET_PROCESSING", payload: false });
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: generateId(), role: "system",
              content: err instanceof Error ? err.message : "Contact lookup failed.",
              timestamp: new Date(),
            },
          });
        }
        return;
      }

      // ── NOTE INTENT — save to /api/notes + Vault Memory ──
      if (intent.type === "note") {
        const noteBody = intent.noteContent ?? raw;

        // If bare "add a note" with no content, prompt the user
        if (!noteBody || noteBody.trim().length < 3) {
          dispatch({ type: "SET_PROCESSING", payload: false });
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: generateId(), role: "assistant",
              content: "What would you like me to note down?",
              timestamp: new Date(),
            },
          });
          return;
        }

        try {
          const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: noteBody,
              tags: intent.noteTags ?? [],
              source: state.voiceState !== "idle" ? "voice" : "manual",
            }),
          });

          dispatch({ type: "SET_PROCESSING", payload: false });

          if (res.status === 401) {
            dispatch({
              type: "ADD_MESSAGE",
              payload: {
                id: generateId(), role: "system",
                content: "Session expired. Please sign in again to save notes.",
                timestamp: new Date(),
              },
            });
            return;
          }

          if (res.status === 429) {
            dispatch({
              type: "ADD_MESSAGE",
              payload: {
                id: generateId(), role: "system",
                content: "Rate limit reached. Wait a moment before saving another note.",
                timestamp: new Date(),
              },
            });
            return;
          }

          if (!res.ok) throw new Error(`Notes API returned ${res.status}`);

          const data = await res.json();

          // Confirm save with structured response
          const tagLine = (intent.noteTags ?? []).length > 0
            ? ` Tagged: ${(intent.noteTags ?? []).join(", ")}.`
            : "";
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: generateId(), role: "assistant",
              content: `Noted and saved.${tagLine}`,
              timestamp: new Date(),
            },
          });

          // Also save to Vault Memory (IndexedDB) for context injection
          // This keeps the note accessible for AI context even offline
          extractAndSaveFacts(raw, `Note saved: ${noteBody}`).then(() => {
            getAllFacts().then((facts) => {
              dispatch({ type: "SET_MEMORY_FACTS", payload: facts });
            });
          });

          // Unused but available: data.note.id for future note management UI
          void data;

        } catch (err) {
          dispatch({ type: "SET_PROCESSING", payload: false });
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: generateId(), role: "system",
              content: err instanceof Error
                ? `Failed to save note: ${err.message}`
                : "Note save failed. Check your connection.",
              timestamp: new Date(),
            },
          });
        }
        return;
      }

      // ── GENERAL AGENT CALL ──
      try {
        // Build memory context (client-side only — no personal data sent to server)
        const memoryContext = await buildMemoryContext(raw);

        // Build conversation history for multi-turn context
        const history = state.messages
          .filter((m) => m.role !== "system")
          .slice(-8)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: memoryContext ? `${raw}\n\n[Context]${memoryContext}` : raw,
            conversationHistory: history,
          }),
        });

        if (res.status === 429) {
          const data = await res.json();
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: generateId(), role: "system",
              content: `Rate limit reached. Wait ${Math.ceil((data.retryAfterMs ?? 60000) / 1000)}s before sending again.`,
              timestamp: new Date(),
            },
          });
          return;
        }

        if (!res.ok) throw new Error(`Agent returned ${res.status}`);

        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: generateId(), role: "assistant",
          content: data.reply, timestamp: new Date(),
          provider: data.provider, latencyMs: data.latencyMs,
        };
        dispatch({ type: "ADD_MESSAGE", payload: assistantMsg });

        // ── SPEAK RESPONSE (voice mode — if speechSynthesis is configured) ──
        // Only speaks if hands-free mode has pre-loaded a voice preference.
        // In text mode this is a no-op because speakResponse checks
        // window.speechSynthesis.getVoices() and returns early if none active.
        // Voice mode sets up voices on toggle-on; text mode never calls this path.
        // We defer to avoid blocking the UI dispatch above.
        if (typeof window !== "undefined" && window.speechSynthesis?.getVoices().length > 0) {
          speakResponse(data.reply);
        }

        // ── EXTRACT MEMORY FACTS (silent, non-blocking) ──
        extractAndSaveFacts(raw, data.reply).then(() => {
          getAllFacts().then((facts) => {
            dispatch({ type: "SET_MEMORY_FACTS", payload: facts });
          });
        });

      } catch (err) {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: generateId(), role: "system",
            content: err instanceof Error ? `Error: ${err.message}` : "Unknown error. Check your connection.",
            timestamp: new Date(),
          },
        });
      } finally {
        dispatch({ type: "SET_PROCESSING", payload: false });
      }
    },
    [inputText, state.lockdown, state.voiceState, state.messages, toggleTorch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Dial confirmation ────────────────────────
  const confirmDial = useCallback(() => {
    if (!state.dialIntent) return;
    window.location.href = `tel:${state.dialIntent.number.replace(/\s/g, "")}`;
    dispatch({ type: "SET_DIAL_INTENT", payload: null });
  }, [state.dialIntent]);

  const dismissDial = useCallback(() => {
    dispatch({ type: "SET_DIAL_INTENT", payload: null });
    dispatch({
      type: "ADD_MESSAGE",
      payload: { id: generateId(), role: "system", content: "Call cancelled.", timestamp: new Date() },
    });
  }, []);

  // ── Memory panel handlers ────────────────────
  const handleClearMemory = useCallback(async () => {
    await clearAllFacts();
    dispatch({ type: "SET_MEMORY_FACTS", payload: [] });
    dispatch({ type: "TOGGLE_MEMORY_PANEL" });
    dispatch({
      type: "ADD_MESSAGE",
      payload: { id: generateId(), role: "system", content: "Vault memory cleared. All on-device context wiped.", timestamp: new Date() },
    });
  }, []);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  const isLocked = state.lockdown === "active";
  const isListening = state.voiceState === "listening";

  return (
    <>
      {/* Screen flash overlay (torch fallback) */}
      {state.torchActive && !torchTrackRef.current && (
        <div style={styles.screenFlash} aria-hidden="true" />
      )}

      {/* Overlays */}
      {state.dialIntent && (
        <DialOverlay intent={state.dialIntent} onConfirm={confirmDial} onDismiss={dismissDial} />
      )}
      {state.showMemoryPanel && (
        <MemoryPanel
          facts={state.memoryFacts}
          onClear={handleClearMemory}
          onClose={() => dispatch({ type: "TOGGLE_MEMORY_PANEL" })}
        />
      )}
      {state.showContactImporter && (
        <ContactImporter
          onContactSaved={(name, phone) => {
            dispatch({ type: "TOGGLE_CONTACT_IMPORTER" });
            dispatch({
              type: "ADD_MESSAGE",
              payload: {
                id: generateId(), role: "system",
                content: `Contact saved: ${name} · ${phone}`,
                timestamp: new Date(),
              },
            });
          }}
          onClose={() => dispatch({ type: "TOGGLE_CONTACT_IMPORTER" })}
        />
      )}

      {/* ── MAIN SHELL ── */}
      <div style={{ ...styles.shell, ...(isLocked ? styles.shellLocked : {}) }}>

        {/* ── HEADER ── */}
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.wordmark}>ZORA</span>
            <span style={styles.headerDivider} aria-hidden="true" />
            <span style={styles.headerSub}>PRIVACY-FIRST AI</span>
          </div>
          <div style={styles.headerRight}>
            {/* Memory indicator */}
            <button
              style={{
                ...styles.iconBtn,
                color: state.memoryFacts.length > 0 ? TOKEN.green : TOKEN.textDim,
                position: "relative",
              }}
              onClick={() => dispatch({ type: "TOGGLE_MEMORY_PANEL" })}
              aria-label={`Vault memory — ${state.memoryFacts.length} facts stored`}
              title="Vault Memory"
            >
              ◈
              {state.memoryFacts.length > 0 && (
                <span style={styles.memoryBadge}>{state.memoryFacts.length}</span>
              )}
            </button>

            {/* Add contact */}
            <button
              style={styles.iconBtn}
              onClick={() => dispatch({ type: "TOGGLE_CONTACT_IMPORTER" })}
              aria-label="Add contact"
              title="Add Contact"
            >
              ＋
            </button>

            {/* Privacy filter */}
            <button
              style={{
                ...styles.iconBtn,
                color: state.privacyActive ? TOKEN.red : TOKEN.textDim,
              }}
              onClick={() => dispatch({ type: "TOGGLE_PRIVACY" })}
              aria-label={state.privacyActive ? "Deactivate privacy filter" : "Activate privacy filter"}
              aria-pressed={state.privacyActive}
              title="Privacy Filter"
            >
              ◉
            </button>

            {/* Torch */}
            <button
              style={{ ...styles.iconBtn, color: state.torchActive ? TOKEN.amber : TOKEN.textDim }}
              onClick={toggleTorch}
              aria-label={state.torchActive ? "Deactivate torch" : "Activate torch"}
              title="Torch"
            >
              ⚡
            </button>

            {/* Lockdown */}
            <button
              style={{ ...styles.lockBtn, ...(isLocked ? styles.lockBtnActive : {}) }}
              onClick={() => dispatch({ type: "TOGGLE_LOCKDOWN" })}
              aria-label={isLocked ? "Deactivate lockdown" : "Activate lockdown"}
              aria-pressed={isLocked}
            >
              <LockIcon locked={isLocked} />
              <span style={styles.lockLabel}>{isLocked ? "LOCKED" : "LOCK"}</span>
            </button>
          </div>
        </header>

        {/* Lockdown banner */}
        {isLocked && (
          <div style={styles.lockdownBanner} role="alert">
            <span style={styles.lockdownDot} aria-hidden="true" />
            LOCKDOWN ACTIVE — INPUT SUSPENDED
          </div>
        )}

        {/* Torch notice */}
        {state.torchError && (
          <div style={styles.torchNotice} role="status">{state.torchError}</div>
        )}

        {/* ── MESSAGE FEED ── */}
        <PrivacyFilter active={state.privacyActive} spotlightRadius={120}>
          <main style={styles.feed} aria-label="Conversation" aria-live="polite">
            {state.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {state.isAgentProcessing && <ProcessingIndicator />}
            {state.interimTranscript && (
              <div style={styles.interimStrip} aria-live="polite" aria-label="Voice transcript in progress">
                <span style={styles.interimLabel}>LISTENING</span>
                <span style={styles.interimText}>{state.interimTranscript}</span>
                <span style={styles.interimCursor} aria-hidden="true">▋</span>
              </div>
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </main>
        </PrivacyFilter>

        {/* ── INPUT BAR ── */}
        <footer style={styles.inputBar}>
          <div style={styles.inputWrap}>
            <textarea
              ref={inputRef}
              style={{ ...styles.input, ...(isLocked ? styles.inputLocked : {}) }}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isLocked
                  ? "Input locked. Deactivate lockdown to continue."
                  : "Type a command or hold mic to speak…"
              }
              disabled={isLocked}
              rows={1}
              aria-label="Message input"
              aria-disabled={isLocked}
              spellCheck
            />
            <div style={styles.inputActions}>
              <button
                style={{ ...styles.voiceBtn, ...(isListening ? styles.voiceBtnActive : {}) }}
                onMouseDown={startVoice}
                onMouseUp={stopVoice}
                onTouchStart={startVoice}
                onTouchEnd={stopVoice}
                disabled={isLocked}
                aria-label={isListening ? "Stop recording" : "Start voice input"}
                aria-pressed={isListening}
              >
                <MicIcon active={isListening} />
              </button>
              <button
                style={{ ...styles.sendBtn, opacity: !inputText.trim() || isLocked ? 0.3 : 1 }}
                onClick={() => handleSend()}
                disabled={!inputText.trim() || isLocked}
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </div>
          </div>
          {isListening && (
            <p style={styles.voiceHint} role="status">Hold to record · Release to send</p>
          )}
          {state.voiceState === "error" && (
            <p style={{ ...styles.voiceHint, color: TOKEN.red }} role="alert">
              Voice unavailable — type your command
            </p>
          )}
        </footer>

        {/* ── FIRST-RUN VOICE TOOLTIP ── */}
        {showVoiceTooltip && (
          <div style={styles.tooltipBanner} role="status" aria-live="polite">
            <div style={styles.tooltipInner}>
              <div style={styles.tooltipText}>
                <span style={styles.tooltipTitle}>HANDS-FREE MODE</span>
                <span style={styles.tooltipBody}>
                  Toggle below and say <strong style={{ color: TOKEN.textPrimary }}>"Hey Zora"</strong> followed by any command.
                  Only the wake word activates the mic — everything else is discarded instantly.
                </span>
              </div>
              <button
                style={styles.tooltipDismiss}
                onClick={dismissVoiceTooltip}
                aria-label="Dismiss voice tip"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* ── VOICE ACTIVATION CONTROLLER (Phase 2) ── */}
        <VoiceActivationController
          onHandleSend={handleSend as HandleSendFn}
          onDetectIntent={detectIntent}
          onToggleTorch={toggleTorch as ToggleTorchFn}
          onToggleLockdown={() => dispatch({ type: "TOGGLE_LOCKDOWN" })}
          isLocked={isLocked}
        />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────

const TOKEN = {
  bg: "#09090b",
  bgElevated: "#111113",
  bgHover: "#18181b",
  border: "#1e1e24",
  borderActive: "#3f3f46",
  textPrimary: "#ffffff",
  textMuted: "#a1a1aa",
  textDim: "#52525b",
  green: "#10b981",
  amber: "#fbbf24",
  red: "#ef4444",
  radius: "4px",
  radiusMd: "6px",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
  fontSans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
} as const;

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", flexDirection: "column", width: "100%", maxWidth: "780px", height: "100dvh", margin: "0 auto", backgroundColor: TOKEN.bg, fontFamily: TOKEN.fontSans, color: TOKEN.textPrimary, borderLeft: `1px solid ${TOKEN.border}`, borderRight: `1px solid ${TOKEN.border}`, position: "relative", overflow: "hidden" },
  shellLocked: { outline: `2px solid ${TOKEN.red}`, outlineOffset: "-2px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: "52px", borderBottom: `1px solid ${TOKEN.border}`, flexShrink: 0, backgroundColor: TOKEN.bg, zIndex: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: "10px" },
  wordmark: { fontFamily: TOKEN.fontMono, fontSize: "12px", fontWeight: 700, letterSpacing: "0.15em", color: TOKEN.textPrimary },
  headerDivider: { width: "1px", height: "14px", backgroundColor: TOKEN.border },
  headerSub: { fontFamily: TOKEN.fontMono, fontSize: "10px", letterSpacing: "0.1em", color: TOKEN.textDim },
  headerRight: { display: "flex", alignItems: "center", gap: "6px" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: "6px", fontSize: "16px", lineHeight: 1, borderRadius: TOKEN.radius, color: TOKEN.textDim, transition: "color 0.15s", position: "relative" },
  memoryBadge: { position: "absolute", top: "0px", right: "0px", width: "14px", height: "14px", borderRadius: "50%", backgroundColor: TOKEN.green, color: TOKEN.bg, fontSize: "8px", fontFamily: TOKEN.fontMono, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  lockBtn: { display: "flex", alignItems: "center", gap: "5px", background: "none", border: `1px solid ${TOKEN.border}`, color: TOKEN.textMuted, cursor: "pointer", padding: "5px 10px", borderRadius: TOKEN.radius, fontFamily: TOKEN.fontMono, fontSize: "10px", letterSpacing: "0.08em", transition: "all 0.15s" },
  lockBtnActive: { borderColor: TOKEN.red, color: TOKEN.red, backgroundColor: "rgba(239,68,68,0.08)" },
  lockLabel: { letterSpacing: "0.1em" },
  lockdownBanner: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: "rgba(239,68,68,0.08)", borderBottom: `1px solid rgba(239,68,68,0.25)`, fontFamily: TOKEN.fontMono, fontSize: "10px", letterSpacing: "0.12em", color: TOKEN.red, flexShrink: 0 },
  lockdownDot: { width: "6px", height: "6px", borderRadius: "50%", backgroundColor: TOKEN.red, display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" },
  torchNotice: { padding: "6px 16px", backgroundColor: "rgba(251,191,36,0.06)", borderBottom: `1px solid rgba(251,191,36,0.15)`, fontFamily: TOKEN.fontMono, fontSize: "10px", color: TOKEN.amber, letterSpacing: "0.05em", flexShrink: 0 },
  feed: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", scrollbarWidth: "none" },
  messageRow: { display: "flex", alignItems: "flex-end", gap: "8px" },
  agentBadge: { width: "28px", height: "28px", borderRadius: TOKEN.radius, backgroundColor: TOKEN.bgElevated, border: `1px solid ${TOKEN.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TOKEN.fontMono, fontSize: "8px", fontWeight: 700, letterSpacing: "0.05em", color: TOKEN.textDim, flexShrink: 0 },
  bubble: { maxWidth: "72%", padding: "10px 13px", borderRadius: TOKEN.radiusMd, wordBreak: "break-word" },
  userBubble: { backgroundColor: TOKEN.bgElevated, border: `1px solid ${TOKEN.borderActive}`, borderBottomRightRadius: TOKEN.radius },
  agentBubble: { backgroundColor: TOKEN.bgHover, border: `1px solid ${TOKEN.border}`, borderBottomLeftRadius: TOKEN.radius },
  systemBubble: { backgroundColor: "transparent", border: `1px dashed ${TOKEN.border}`, maxWidth: "90%", width: "100%" },
  systemLabel: { fontFamily: TOKEN.fontMono, fontSize: "8px", letterSpacing: "0.15em", color: TOKEN.textDim, marginBottom: "4px" },
  bubbleText: { margin: 0, fontSize: "14px", lineHeight: 1.55, color: TOKEN.textPrimary },
  systemText: { margin: 0, fontSize: "12px", lineHeight: 1.5, color: TOKEN.textMuted, fontFamily: TOKEN.fontMono },
  timestamp: { display: "block", marginTop: "5px", fontSize: "10px", color: TOKEN.textDim, fontFamily: TOKEN.fontMono, letterSpacing: "0.04em" },
  voiceBadge: { color: TOKEN.green, fontWeight: 700 },
  providerBadge: { color: TOKEN.textDim, opacity: 0.6 },
  latencyBadge: { color: TOKEN.textDim, opacity: 0.5 },
  interimStrip: { display: "flex", alignItems: "baseline", gap: "8px", padding: "10px 13px", border: `1px solid ${TOKEN.border}`, borderLeft: `2px solid ${TOKEN.green}`, borderRadius: TOKEN.radius, backgroundColor: "rgba(16,185,129,0.04)" },
  interimLabel: { fontFamily: TOKEN.fontMono, fontSize: "8px", letterSpacing: "0.15em", color: TOKEN.green, flexShrink: 0 },
  interimText: { fontFamily: TOKEN.fontMono, fontSize: "14px", color: TOKEN.textMuted, fontStyle: "italic", lineHeight: 1.5 },
  interimCursor: { fontFamily: TOKEN.fontMono, color: TOKEN.green, animation: "blink 1s step-end infinite", flexShrink: 0 },
  processingRow: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" },
  processingLabel: { fontFamily: TOKEN.fontMono, fontSize: "10px", letterSpacing: "0.1em", color: TOKEN.textDim },
  dots: { display: "flex", gap: "4px", alignItems: "center" },
  dot: { width: "4px", height: "4px", borderRadius: "50%", backgroundColor: TOKEN.textDim, display: "inline-block", animation: "dotPulse 1.2s ease-in-out infinite" },
  inputBar: { flexShrink: 0, borderTop: `1px solid ${TOKEN.border}`, padding: "12px 16px", backgroundColor: TOKEN.bg },
  inputWrap: { display: "flex", alignItems: "flex-end", gap: "8px", border: `1px solid ${TOKEN.border}`, borderRadius: TOKEN.radiusMd, padding: "8px 10px", backgroundColor: TOKEN.bgElevated, transition: "border-color 0.15s" },
  input: { flex: 1, background: "none", border: "none", outline: "none", color: TOKEN.textPrimary, fontFamily: TOKEN.fontSans, fontSize: "14px", lineHeight: 1.5, resize: "none", padding: 0, margin: 0, maxHeight: "120px", overflowY: "auto" },
  inputLocked: { color: TOKEN.textDim, cursor: "not-allowed" },
  inputActions: { display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 },
  voiceBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: TOKEN.radius, border: `1px solid ${TOKEN.border}`, backgroundColor: "transparent", color: TOKEN.textMuted, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 },
  voiceBtnActive: { borderColor: TOKEN.green, color: TOKEN.green, backgroundColor: "rgba(16,185,129,0.08)" },
  sendBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: TOKEN.radius, border: "none", backgroundColor: TOKEN.textPrimary, color: TOKEN.bg, cursor: "pointer", transition: "opacity 0.15s", flexShrink: 0 },
  voiceHint: { margin: "6px 0 0", fontFamily: TOKEN.fontMono, fontSize: "10px", letterSpacing: "0.08em", color: TOKEN.textDim, textAlign: "center" as const },
  screenFlash: { position: "fixed", inset: 0, backgroundColor: "#ffffff", zIndex: 9999, pointerEvents: "none" },
  tooltipBanner: { flexShrink: 0, borderTop: `1px solid ${TOKEN.border}`, backgroundColor: "rgba(16,185,129,0.04)" },
  tooltipInner: { display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px" },
  tooltipText: { flex: 1, display: "flex", flexDirection: "column" as const, gap: "4px" },
  tooltipTitle: { fontFamily: TOKEN.fontMono, fontSize: "8px", letterSpacing: "0.18em", color: TOKEN.green },
  tooltipBody: { fontSize: "12px", color: TOKEN.textMuted, lineHeight: 1.55 },
  tooltipDismiss: { flexShrink: 0, background: "none", border: `1px solid ${TOKEN.border}`, borderRadius: TOKEN.radius, padding: "5px 12px", color: TOKEN.textMuted, fontFamily: TOKEN.fontMono, fontSize: "9px", letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap" as const },
};

const overlayStyles: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9000, padding: "0 0 24px" },
  panel: { width: "100%", maxWidth: "480px", backgroundColor: "#111113", border: `1px solid #1e1e24`, borderRadius: "8px 8px 4px 4px", padding: "28px 24px 24px", display: "flex", flexDirection: "column", gap: "6px" },
  eyebrow: { fontFamily: TOKEN.fontMono, fontSize: "9px", letterSpacing: "0.2em", color: TOKEN.textDim, marginBottom: "4px" },
  name: { fontFamily: TOKEN.fontSans, fontSize: "22px", fontWeight: 600, color: TOKEN.textPrimary, lineHeight: 1.2 },
  number: { fontFamily: TOKEN.fontMono, fontSize: "15px", color: TOKEN.textMuted, letterSpacing: "0.05em", marginBottom: "16px" },
  actions: { display: "flex", gap: "8px", marginTop: "8px" },
  dismissBtn: { flex: 1, padding: "12px", border: `1px solid ${TOKEN.border}`, borderRadius: TOKEN.radius, backgroundColor: "transparent", color: TOKEN.textMuted, fontFamily: TOKEN.fontSans, fontSize: "14px", cursor: "pointer" },
  confirmBtn: { flex: 1, padding: "12px", border: "none", borderRadius: TOKEN.radius, backgroundColor: TOKEN.textPrimary, color: TOKEN.bg, fontFamily: TOKEN.fontSans, fontSize: "14px", fontWeight: 600, cursor: "pointer" },
};
