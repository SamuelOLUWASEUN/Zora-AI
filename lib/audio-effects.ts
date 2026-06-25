// ─────────────────────────────────────────────
// Zora — Audio Effects Engine
// lib/audio-effects.ts
//
// Three exported utilities:
//   playListenChime()   — dual-tone sine-wave chime via Web Audio API
//   speakResponse()     — TTS with neural voice preference + cancel-first
//   requestWakeLock()   — screen lock via WakeLock API
//
// All client-side. Zero external assets. Zero network calls.
// Safe to import from any "use client" component.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// AUDIO CONTEXT SINGLETON
//
// AudioContext must be created lazily — browsers block
// AudioContext construction before a user gesture.
// We create it once on first call and reuse it.
// ─────────────────────────────────────────────

let _audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (_audioContext && _audioContext.state !== "closed") {
    return _audioContext;
  }
  _audioContext = new AudioContext();
  return _audioContext;
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface WakeLockSentinel {
  release: () => Promise<void>;
  readonly released: boolean;
  readonly type: string;
}

// ─────────────────────────────────────────────
// playListenChime()
//
// Synthesises a premium dual-tone chime:
//   Tone 1: D5  — 587.33 Hz — 80ms, fade out
//   Tone 2: A5  — 880.00 Hz — 80ms, fade in after 70ms
//
// The slight overlap (10ms) between tones creates a
// clean harmonic "ding-ding" rather than two separate
// clicks. Gain envelope prevents pops on start/stop.
//
// Runs entirely in the AudioContext graph — no files,
// no fetch, no latency beyond the audio scheduler.
// ─────────────────────────────────────────────

export function playListenChime(): void {
  try {
    const ctx = getAudioContext();

    // Resume context if suspended by autoplay policy
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // ── Tone 1: D5 (587.33 Hz) ──
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);

    // Gain envelope: instant attack, fast exponential decay
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.008);   // 8ms attack
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.085);  // 77ms decay

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // ── Tone 2: A5 (880.00 Hz) — starts 70ms after tone 1 ──
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.07);

    // Gain envelope: slight fade-in, exponential decay
    gain2.gain.setValueAtTime(0.001, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.4, now + 0.078);    // 8ms attack
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.165);  // 87ms decay

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.17);

  } catch (err) {
    // Web Audio API unavailable — silently continue
    // (the voice pipeline still works without the chime)
    console.warn("[Zora/audio] playListenChime failed silently:", err);
  }
}

// ─────────────────────────────────────────────
// selectBestVoice()
//
// Private utility. Loops through available voices
// and returns the highest-quality English voice found.
//
// Priority order:
//   1. Google neural voices (Chrome desktop/Android)
//   2. Microsoft neural voices (Edge)
//   3. Any "natural" or "enhanced" labelled voice
//   4. Any en-GB or en-US voice
//   5. Browser default (null → let browser decide)
//
// Called lazily inside speakResponse — voices list
// is async in Chrome (populates after onvoiceschanged).
// ─────────────────────────────────────────────

function selectBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Preference tiers — first match wins
  const tiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
    // Tier 1: Google neural (Chrome/Android)
    (v) => /google/i.test(v.name) && /en[-_](gb|us|au)/i.test(v.lang),
    // Tier 2: Microsoft neural (Edge)
    (v) => /microsoft/i.test(v.name) && /natural|neural/i.test(v.name) && /en/i.test(v.lang),
    // Tier 3: Any voice labelled enhanced/natural
    (v) => /enhanced|natural|neural/i.test(v.name) && /en/i.test(v.lang),
    // Tier 4: Apple Siri (macOS/iOS fallback)
    (v) => /samantha|karen|daniel|moira/i.test(v.name),
    // Tier 5: Any English voice
    (v) => /en[-_](gb|us|au|in)/i.test(v.lang),
    // Tier 6: Any English
    (v) => v.lang.toLowerCase().startsWith("en"),
  ];

  for (const tier of tiers) {
    const match = voices.find(tier);
    if (match) return match;
  }

  return null;
}

// ─────────────────────────────────────────────
// speakResponse(text)
//
// Speaks the given text using the Web Speech
// Synthesis API at an executive, clear pace.
//
// Steps:
//   1. Cancel any in-progress speech immediately
//   2. Wait one microtask (Chrome bug: cancel is async)
//   3. Select the best available voice
//   4. Create and configure the utterance
//   5. Speak
//
// Rate 1.05 — slightly above natural pace, sounds
// crisp and confident without feeling rushed.
//
// Falls back gracefully if speechSynthesis is
// unavailable (Firefox private mode, some iOS contexts).
// ─────────────────────────────────────────────

export function speakResponse(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    console.warn("[Zora/audio] speechSynthesis not available in this browser.");
    return;
  }

  if (!text || text.trim().length === 0) return;

  // Step 1: Cancel in-progress speech
  window.speechSynthesis.cancel();

  // Step 2: Defer one tick — Chrome's cancel() is not synchronous
  // Without this, the new utterance sometimes gets swallowed
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text.trim());

    // Step 3: Select best voice (may return null — browser picks default)
    const voice = selectBestVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-GB";
    }

    // Step 4: Configure cadence
    utterance.rate = 1.05;    // executive pace
    utterance.pitch = 1.0;    // neutral — not robotic
    utterance.volume = 1.0;   // full volume

    // Step 5: Error handler — silent, never crash the pipeline
    utterance.onerror = (e) => {
      // "interrupted" fires when cancel() is called mid-speech — expected
      if (e.error !== "interrupted") {
        console.warn("[Zora/audio] speechSynthesis error:", e.error);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, 50);
}

// ─────────────────────────────────────────────
// cancelSpeech()
//
// Immediately halts any in-progress TTS.
// Called by the voice interrupt ("Zora, stop").
// Exported so VoiceActivationController can call it.
// ─────────────────────────────────────────────

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ─────────────────────────────────────────────
// requestWakeLock()
//
// Requests a screen wake lock to keep the device
// display active during hands-free voice mode.
//
// Returns the WakeLockSentinel so the caller can
// release it when hands-free mode is toggled off.
//
// Returns null if:
//   - API not supported (Firefox, older Safari)
//   - User denied permission
//   - Page is not visible (background tab)
//
// Failure is always silent — voice mode still
// works without the lock, the screen may just dim.
// ─────────────────────────────────────────────

export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      console.warn("[Zora/audio] WakeLock API not supported in this browser.");
      return null;
    }

    // navigator.wakeLock.request() resolves with a WakeLockSentinel
    // It rejects if the page is not visible or permission is denied
    const sentinel = await (
      navigator as Navigator & {
        wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
      }
    ).wakeLock.request("screen");

    // Auto-reacquire on page visibility change (lock releases when tab hides)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && sentinel.released) {
        // Attempt to reacquire — if it fails, silently continue
        try {
          await requestWakeLock();
        } catch {
          // Silent
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange, {
      once: true, // clean up after one visibility change
    });

    return sentinel;
  } catch (err) {
    // Expected on Firefox, older Safari, background tabs
    console.warn("[Zora/audio] WakeLock request failed silently:", err);
    return null;
  }
}
