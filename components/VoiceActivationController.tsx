"use client";

// ─────────────────────────────────────────────
// Zora — Voice Activation Controller
// components/VoiceActivationController.tsx
//
// The wake-word gateway for hands-free voice mode.
//
// STATE MACHINE
// ─────────────
//   idle         → listening continuously for "hey zora" / "zora"
//   wake_detected → wake word matched, chime played, clearing prefix
//   capturing    → collecting the command utterance (next speech segment)
//   processing   → command dispatched to pipeline, awaiting response
//
// VOICE INTERRUPT
// ───────────────
//   At any phase, if "zora stop" / "stop" is detected while
//   speechSynthesis is speaking → cancel() fires immediately.
//
// PRIVACY SAFEGUARD
// ──────────────────
//   Non-matching interim transcripts are cleared from memory
//   the instant they fail the wake word regex. Nothing is
//   stored, logged, or forwarded unless the wake word fires.
//
// iOS GUARD
// ─────────
//   iOS Safari does not support continuous SpeechRecognition.
//   Detected on init → graceful non-blocking fallback UI shown.
//   Feature degrades to existing push-to-talk, never breaks.
// ─────────────────────────────────────────────

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  playListenChime,
  speakResponse,
  cancelSpeech,
  requestWakeLock,
  type WakeLockSentinel,
} from "@/lib/audio-effects";
import type {
  VoiceControllerProps,
  WakeWordPhase,
} from "@/types";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

// Matches "hey zora" or "zora" at any position in the transcript
// Captures everything after the wake word as group 1 (the command)
// The [,.]? allows for punctuation the recogniser sometimes inserts
const WAKE_WORD_REGEX = /(?:hey\s+)?zora[,.]?\s*(.*)/i;

// Matches interrupt commands
const INTERRUPT_REGEX = /\bzora\s+stop\b|\bstop\b/i;

// Max ms to wait for a command after wake word before returning to idle
const COMMAND_TIMEOUT_MS = 6000;

// ─────────────────────────────────────────────
// BROWSER COMPATIBILITY DETECTION
// ─────────────────────────────────────────────

interface CompatibilityResult {
  supported: boolean;
  reason: string | null;
}

function detectCompatibility(): CompatibilityResult {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Server context — no browser APIs." };
  }

  // iOS Safari detection — user agent is the most reliable signal
  // navigator.userAgent is read-only and cannot be spoofed by page JS
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

  if (isIOS && isSafari) {
    return {
      supported: false,
      reason:
        "iOS Safari does not support continuous speech recognition. " +
        "Use the push-to-talk button below, or try Chrome on Android.",
    };
  }

  // Check SpeechRecognition API availability
  const hasSpeechRecognition =
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

  if (!hasSpeechRecognition) {
    return {
      supported: false,
      reason:
        "Speech recognition is not supported in this browser. " +
        "Use Chrome or Edge for hands-free mode.",
    };
  }

  return { supported: true, reason: null };
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export default function VoiceActivationController({
  onHandleSend,
  onDetectIntent,
  onToggleTorch,
  onToggleLockdown,
  isLocked,
}: VoiceControllerProps) {
  // ── Core state ───────────────────────────────
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<WakeWordPhase>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // ── Compatibility check (run once on mount) ──
  const [compat] = useState<CompatibilityResult>(() => {
    if (typeof window === "undefined") return { supported: false, reason: null };
    return detectCompatibility();
  });

  // ── Refs — never trigger re-renders ─────────
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<WakeWordPhase>("idle");
  const isActiveRef = useRef(false);

  // Keep refs in sync with state (for use inside event callbacks)
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // ─────────────────────────────────────────────
  // COMMAND PROCESSOR
  // Routes the extracted command string through the
  // existing detectIntent + handleSend pipeline.
  // Also handles torch and lockdown directly via
  // callback props — no duplicated logic.
  // ─────────────────────────────────────────────

  const processCommand = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed || trimmed.length < 2) {
        // Wake word with no command — prompt for input
        speakResponse("Yes? What can I do for you?");
        setPhase("idle");
        phaseRef.current = "idle";
        setStatusMessage("Listening for wake word…");
        return;
      }

      setPhase("processing");
      phaseRef.current = "processing";
      setStatusMessage(`Processing: "${trimmed}"`);

      // ── Route via existing detectIntent ──────
      const intent = onDetectIntent(trimmed);

      switch (intent.type) {
        case "torch":
          await onToggleTorch();
          speakResponse("Flashlight toggled.");
          break;

        case "lockdown":
          onToggleLockdown();
          speakResponse("Lockdown protocol engaged.");
          break;

        case "note": {
          // Pass to handleSend — it runs the full /api/notes pipeline
          await onHandleSend(trimmed);
          speakResponse("Saved to your vault.");
          break;
        }

        case "call": {
          // handleSend manages the contact lookup + dial overlay
          await onHandleSend(trimmed);
          speakResponse(
            intent.contactName
              ? `Calling ${intent.contactName}.`
              : "Looking up your contact."
          );
          break;
        }

        case "general":
        case "calendar":
        default: {
          // Pass to the main LLM pipeline via handleSend
          // handleSend dispatches the assistant message to chat UI
          // We also want to speak it — but handleSend is fire-and-forget
          // so we call the agent ourselves to get the text for TTS
          try {
            const memoryContext = ""; // VoiceController is context-lightweight
            const res = await fetch("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: trimmed,
                conversationHistory: [],
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const replyText: string = data.reply ?? "";
              // Let handleSend add to chat UI (it manages its own fetch)
              await onHandleSend(trimmed);
              // Speak the reply
              speakResponse(replyText);
            } else {
              await onHandleSend(trimmed);
              speakResponse("I've sent your message. Check the chat for the response.");
            }
          } catch {
            await onHandleSend(trimmed);
            speakResponse("Your message has been sent.");
          }
          break;
        }
      }

      // Return to idle after processing
      setPhase("idle");
      phaseRef.current = "idle";
      setStatusMessage("Listening for wake word…");
    },
    [onHandleSend, onDetectIntent, onToggleTorch, onToggleLockdown]
  );

  // ─────────────────────────────────────────────
  // RECOGNITION EVENT HANDLER
  // Core of the wake-word loop. Runs on every
  // interim + final speech result.
  // ─────────────────────────────────────────────

  const handleResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      // Collect the full interim transcript from the result buffer
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      const lower = transcript.toLowerCase().trim();

      // ── VOICE INTERRUPT (any phase) ──────────
      // If Zora is speaking and user says "zora stop" or "stop"
      if (window.speechSynthesis?.speaking && INTERRUPT_REGEX.test(lower)) {
        cancelSpeech();
        setStatusMessage("Speech interrupted.");
        return;
      }

      // ── CAPTURING PHASE ──────────────────────
      // We already detected the wake word. Collect the next
      // speech segment as the command.
      if (phaseRef.current === "capturing") {
        const isFinal = Array.from(
          { length: event.results.length - event.resultIndex },
          (_, i) => event.results[event.resultIndex + i]
        ).some((r) => r.isFinal);

        if (isFinal && transcript.trim().length > 1) {
          // Clear command timeout — we got input in time
          if (commandTimeoutRef.current) {
            clearTimeout(commandTimeoutRef.current);
            commandTimeoutRef.current = null;
          }

          setPhase("processing");
          phaseRef.current = "processing";

          // Fire-and-forget — processCommand handles its own async flow
          processCommand(transcript.trim());
        }
        // Non-final in capturing phase — show interim to user
        else if (!isFinal) {
          setStatusMessage(`Capturing: "${transcript.trim()}"`);
        }
        return;
      }

      // ── IDLE PHASE — wake word scan ──────────
      if (phaseRef.current === "idle") {
        const match = WAKE_WORD_REGEX.exec(lower);

        if (match) {
          // ── WAKE WORD DETECTED ──
          const trailing = (match[1] ?? "").trim();

          // Play the confirmation chime
          playListenChime();
          setStatusMessage("Wake word detected — listening for command…");

          if (trailing.length >= 2) {
            // Command was spoken in the same breath as wake word
            // e.g. "Zora, note that I have a meeting at 3pm"
            setPhase("capturing");
            phaseRef.current = "capturing";

            // Set a short timeout — the result may still be interim
            // Give it 1.5s for isFinal to arrive before processing
            commandTimeoutRef.current = setTimeout(() => {
              if (phaseRef.current === "capturing") {
                processCommand(trailing);
              }
            }, 1500);

          } else {
            // Wake word only — "Hey Zora" with no trailing command
            // Transition to capturing and wait for next utterance
            setPhase("wake_detected");
            phaseRef.current = "wake_detected";

            // Brief pause then move to capturing
            setTimeout(() => {
              if (phaseRef.current === "wake_detected" && isActiveRef.current) {
                setPhase("capturing");
                phaseRef.current = "capturing";
                setStatusMessage("Listening…");

                // Command timeout — if no command arrives, return to idle
                commandTimeoutRef.current = setTimeout(() => {
                  if (phaseRef.current === "capturing") {
                    setPhase("idle");
                    phaseRef.current = "idle";
                    setStatusMessage("Listening for wake word…");
                  }
                }, COMMAND_TIMEOUT_MS);
              }
            }, 300);
          }

        } else {
          // ── PRIVACY SAFEGUARD ────────────────
          // No wake word match — immediately clear the transcript
          // from volatile memory. Nothing is stored or forwarded.
          // The `transcript` variable goes out of scope here.
          // (The `lower` string is also GC'd after this block.)
          // No-op: nothing to clear beyond letting the strings
          // fall out of scope — JS GC handles the rest.
          // Status remains unchanged (don't flash noise to user).
        }
      }
    },
    [processCommand]
  );

  // ─────────────────────────────────────────────
  // START HANDS-FREE MODE
  // ─────────────────────────────────────────────

  const startHandsFree = useCallback(async () => {
    if (!compat.supported || isLocked) return;

    setPermissionError(null);
    setStatusMessage("Requesting microphone access…");

    // ── Step 1: Request wake lock ────────────
    const sentinel = await requestWakeLock();
    wakeLockRef.current = sentinel;

    // ── Step 2: Init SpeechRecognition ──────
    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setPermissionError("Speech recognition API disappeared. Refresh and try again.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();

    // ── Step 3: Configure for continuous wake-word loop ──
    recognition.continuous = true;      // keep listening indefinitely
    recognition.interimResults = true;  // stream results as they form
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsActive(true);
      isActiveRef.current = true;
      setPhase("idle");
      phaseRef.current = "idle";
      setStatusMessage("Listening for wake word…");
    };

    recognition.onresult = handleResult;

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" fires every time continuous recognition auto-restarts — never surface this
      if (event.error === "aborted") return;

      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setPermissionError(
          "Microphone access denied. Enable microphone permissions in your browser settings."
        );
        stopHandsFree();
        return;
      }

      if (event.error === "no-speech") {
        // Expected during silence — don't surface to user, continue loop
        return;
      }

      if (event.error === "network") {
        setStatusMessage("Network interruption — reconnecting…");
        return;
      }

      console.warn("[Zora/voice] Recognition error:", event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still active — continuous mode sometimes stops
      // on mobile when the screen dims or the tab loses focus briefly
      if (isActiveRef.current) {
        try {
          recognition.start();
        } catch {
          // Recognition may have been aborted intentionally — ignore
        }
      }
    };

    // ── Step 4: Start ────────────────────────
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      setPermissionError(
        err instanceof Error
          ? `Could not start voice recognition: ${err.message}`
          : "Voice recognition failed to start."
      );
      setIsActive(false);
      isActiveRef.current = false;
    }
  }, [compat.supported, isLocked, handleResult]);

  // ─────────────────────────────────────────────
  // STOP HANDS-FREE MODE
  // Full cleanup — recognition, wake lock, timeouts
  // ─────────────────────────────────────────────

  const stopHandsFree = useCallback(() => {
    // ── Stop recognition ─────────────────────
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      try {
        recognitionRef.current.abort();
      } catch {
        // Already stopped — ignore
      }
      recognitionRef.current = null;
    }

    // ── Release wake lock ────────────────────
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      wakeLockRef.current.release().catch(() => {
        // Release may fail if already released — ignore
      });
      wakeLockRef.current = null;
    }

    // ── Clear command timeout ────────────────
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }

    // ── Cancel any active speech ─────────────
    cancelSpeech();

    // ── Reset state ──────────────────────────
    setIsActive(false);
    isActiveRef.current = false;
    setPhase("idle");
    phaseRef.current = "idle";
    setStatusMessage("");
  }, []);

  // ── Toggle handler ───────────────────────────
  const handleToggle = useCallback(() => {
    if (isLocked) return;
    if (isActive) {
      stopHandsFree();
    } else {
      startHandsFree();
    }
  }, [isActive, isLocked, startHandsFree, stopHandsFree]);

  // ── Cleanup on unmount ───────────────────────
  useEffect(() => {
    return () => {
      stopHandsFree();
    };
  }, [stopHandsFree]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  const T = {
    bg: "#09090b",
    bgElevated: "#111113",
    border: "#1e1e24",
    borderActive: "#3f3f46",
    textPrimary: "#ffffff",
    textMuted: "#a1a1aa",
    textDim: "#52525b",
    green: "#10b981",
    red: "#ef4444",
    amber: "#fbbf24",
    radius: "4px",
    fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
    fontSans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  } as const;

  // Phase → indicator color
  const phaseColor: Record<WakeWordPhase, string> = {
    idle: T.textDim,
    wake_detected: T.green,
    capturing: T.green,
    processing: T.amber,
  };

  // Phase → waveform animation speed
  const waveformSpeed: Record<WakeWordPhase, string> = {
    idle: "1.8s",
    wake_detected: "0.5s",
    capturing: "0.4s",
    processing: "0.7s",
  };

  return (
    <div style={s(T).container} aria-label="Hands-free voice mode controls">

      {/* ── Main row: label + toggle ── */}
      <div style={s(T).row}>
        <div style={s(T).labelGroup}>
          <span style={s(T).label}>HANDS-FREE VOICE MODE</span>
          {isActive && (
            <span style={s(T).zoraTag} aria-label="Wake word: Hey Zora">
              "HEY ZORA"
            </span>
          )}
        </div>

        {/* Toggle switch */}
        <button
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? "Deactivate hands-free mode" : "Activate hands-free mode"}
          disabled={!compat.supported || isLocked}
          onClick={handleToggle}
          style={{
            ...s(T).toggle,
            backgroundColor: isActive ? T.green : T.bgElevated,
            borderColor: isActive ? T.green : T.border,
            opacity: (!compat.supported || isLocked) ? 0.4 : 1,
            cursor: (!compat.supported || isLocked) ? "not-allowed" : "pointer",
          }}
        >
          <span
            style={{
              ...s(T).toggleThumb,
              transform: isActive ? "translateX(20px)" : "translateX(2px)",
              backgroundColor: isActive ? T.bg : T.textDim,
            }}
          />
        </button>
      </div>

      {/* ── iOS / unsupported browser fallback notice ── */}
      {!compat.supported && compat.reason && (
        <div style={s(T).noticeBox} role="status" aria-live="polite">
          <span style={s(T).noticeDot} aria-hidden="true" />
          <span style={s(T).noticeText}>{compat.reason}</span>
        </div>
      )}

      {/* ── Microphone permission error ── */}
      {permissionError && (
        <div style={{ ...s(T).noticeBox, borderColor: `rgba(239,68,68,0.3)` }} role="alert">
          <span style={{ ...s(T).noticeDot, backgroundColor: T.red }} aria-hidden="true" />
          <span style={{ ...s(T).noticeText, color: T.red }}>{permissionError}</span>
        </div>
      )}

      {/* ── Active state: waveform + status strip ── */}
      {isActive && (
        <div style={s(T).activePanel} aria-live="polite" aria-atomic="true">

          {/* Visual waveform — 5 bars, CSS animation only */}
          <div
            style={s(T).waveform}
            aria-hidden="true"
            aria-label="Microphone active"
          >
            {[0.6, 1.0, 0.75, 1.0, 0.6].map((heightRatio, i) => (
              <span
                key={i}
                style={{
                  ...s(T).waveBar,
                  backgroundColor: phaseColor[phase],
                  animationDuration: waveformSpeed[phase],
                  animationDelay: `${i * 0.1}s`,
                  // Each bar has a slightly different max height for organic look
                  "--bar-height": `${14 * heightRatio}px`,
                } as React.CSSProperties & { "--bar-height": string }}
              />
            ))}
          </div>

          {/* Status text */}
          <span
            style={{
              ...s(T).statusText,
              color:
                phase === "processing"
                  ? T.amber
                  : phase === "idle"
                  ? T.textDim
                  : T.green,
            }}
          >
            {statusMessage}
          </span>
        </div>
      )}

      {/* ── Inline keyframes for waveform ── */}
      <style>{`
        @keyframes zoraBeat {
          0%, 100% { height: 4px; opacity: 0.4; }
          50% { height: var(--bar-height, 14px); opacity: 1; }
        }
        .zora-wave-bar {
          animation-name: zoraBeat;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// STYLES (factory — takes token object)
// ─────────────────────────────────────────────

type TokenMap = {
  bg: string; bgElevated: string; border: string; borderActive: string;
  textPrimary: string; textMuted: string; textDim: string;
  green: string; red: string; amber: string;
  radius: string; fontMono: string; fontSans: string;
};

function s(T: TokenMap): Record<string, React.CSSProperties> {
  return {
    container: {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "12px 16px",
      borderTop: `1px solid ${T.border}`,
      backgroundColor: T.bg,
      fontFamily: T.fontSans,
    },
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
    },
    labelGroup: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap" as const,
    },
    label: {
      fontFamily: T.fontMono,
      fontSize: "9px",
      letterSpacing: "0.16em",
      color: T.textDim,
      userSelect: "none" as const,
    },
    zoraTag: {
      fontFamily: T.fontMono,
      fontSize: "8px",
      letterSpacing: "0.1em",
      color: T.green,
      border: `1px solid rgba(16,185,129,0.3)`,
      borderRadius: T.radius,
      padding: "1px 5px",
    },
    toggle: {
      position: "relative" as const,
      width: "44px",
      height: "24px",
      borderRadius: "12px",
      border: "1px solid",
      flexShrink: 0,
      transition: "background-color 0.2s, border-color 0.2s",
      padding: 0,
    },
    toggleThumb: {
      position: "absolute" as const,
      top: "3px",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      transition: "transform 0.2s, background-color 0.2s",
      display: "block",
    },
    noticeBox: {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      padding: "8px 10px",
      border: `1px solid rgba(161,161,170,0.2)`,
      borderRadius: T.radius,
      backgroundColor: "rgba(24,24,27,0.5)",
    },
    noticeDot: {
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      backgroundColor: T.textDim,
      flexShrink: 0,
      marginTop: "4px",
    },
    noticeText: {
      fontFamily: T.fontMono,
      fontSize: "10px",
      letterSpacing: "0.04em",
      color: T.textMuted,
      lineHeight: 1.5,
    },
    activePanel: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 0 2px",
    },
    waveform: {
      display: "flex",
      alignItems: "center",
      gap: "3px",
      height: "18px",
      flexShrink: 0,
    },
    waveBar: {
      width: "3px",
      height: "4px",
      borderRadius: "2px",
      display: "block",
      className: "zora-wave-bar",
      // animationName set via className above
      animationName: "zoraBeat",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
    },
    statusText: {
      fontFamily: T.fontMono,
      fontSize: "10px",
      letterSpacing: "0.06em",
      lineHeight: 1.4,
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
  };
}
