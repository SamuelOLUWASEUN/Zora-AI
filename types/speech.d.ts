// ─────────────────────────────────────────────
// Zora — Web Speech API Type Declarations
// types/speech.d.ts
//
// The Web Speech API (SpeechRecognition) is not part
// of the standard TypeScript DOM lib. Browsers implement
// it under vendor prefixes (webkitSpeechRecognition).
//
// This file provides minimal type shapes so the app
// compiles cleanly in strict production builds without
// relying on `any` scattered through the codebase.
//
// Reference: https://wicg.github.io/speech-api/
// ─────────────────────────────────────────────

export {};

declare global {
  interface SpeechRecognitionResultItem {
    transcript: string;
    confidence: number;
  }

  interface SpeechRecognitionResult {
    readonly length: number;
    isFinal: boolean;
    item(index: number): SpeechRecognitionResultItem;
    [index: number]: SpeechRecognitionResultItem;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;

    start(): void;
    stop(): void;
    abort(): void;

    onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    onend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onresult:
      | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
      | null;
    onerror:
      | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
      | null;
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}
