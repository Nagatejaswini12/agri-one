import type { SupportedLanguage } from "@agri-one/shared-types";

/**
 * The speech layer is deliberately behind an interface.
 *
 * v1 implements it with the browser's own Web Speech API: no key, no
 * cost, no network dependency, and nothing to fail server-side. A hosted
 * Indic provider (Bhashini, Sarvam) would be a second implementation of
 * this same interface — the chat page would not change.
 *
 * Voice is a progressive enhancement throughout. Every method can report
 * "not supported", and the chat page is built so that text input and
 * text output work with the whole speech layer absent.
 */

/** BCP-47 tags for recognition and voice matching. */
export const SPEECH_LANG_TAG: Record<SupportedLanguage, string> = {
  en: "en-IN",
  ta: "ta-IN",
  te: "te-IN",
  hi: "hi-IN"
};

export type RecognitionErrorKind =
  | "no-speech"
  | "not-allowed"
  | "network"
  | "unsupported"
  | "unknown";

export interface RecognitionHandlers {
  /** Interim results arrive with isFinal false so the UI can show progress. */
  onResult: (text: string, isFinal: boolean) => void;
  onError: (kind: RecognitionErrorKind) => void;
  onEnd: () => void;
}

export interface RecognitionSession {
  stop: () => void;
  abort: () => void;
}

export interface SpeechProvider {
  readonly id: string;
  /** False means the mic button must not be rendered at all. */
  isRecognitionSupported: (locale: SupportedLanguage) => boolean;
  /**
   * False means the answer is shown as text with a notice — never
   * silence, which would look like the app ignored the farmer.
   */
  isSynthesisSupported: (locale: SupportedLanguage) => boolean;
  startRecognition: (
    locale: SupportedLanguage,
    handlers: RecognitionHandlers
  ) => RecognitionSession | null;
  /** Speaks exactly the string given — never a re-derived one. */
  speak: (text: string, locale: SupportedLanguage) => Promise<void>;
  cancelSpeaking: () => void;
}
