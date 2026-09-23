import type { SupportedLanguage } from "@agri-one/shared-types";
import {
  SPEECH_LANG_TAG,
  type RecognitionErrorKind,
  type RecognitionHandlers,
  type RecognitionSession,
  type SpeechProvider
} from "@/lib/speech/types";

/**
 * Web Speech API implementation.
 *
 * Recognition is Chrome/Edge/Safari only (Firefox keeps it behind a
 * flag), and which Indic languages actually work depends on the device
 * and its installed language packs — so every capability here is
 * feature-detected at call time rather than assumed from the browser
 * name.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/**
 * Chrome returns an empty voice list on the first call and fills it
 * asynchronously, so a naive check reports "no voice" on page load and
 * never recovers. Voices are cached here and refreshed on
 * `voiceschanged`.
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
function voices(): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  const live = s.getVoices();
  if (live.length > 0) cachedVoices = live;
  return cachedVoices;
}
if (typeof window !== "undefined" && synth()) {
  try {
    synth()?.addEventListener("voiceschanged", () => {
      cachedVoices = synth()?.getVoices() ?? cachedVoices;
    });
  } catch {
    // Older Safari has no addEventListener here; the getVoices() path
    // above still works, so this is not worth failing over.
  }
}

/** Matches on the language subtag, so ta-IN accepts a plain `ta` voice. */
function voiceFor(locale: SupportedLanguage): SpeechSynthesisVoice | null {
  const tag = SPEECH_LANG_TAG[locale].toLowerCase();
  const base = tag.split("-")[0];
  const all = voices();
  return (
    all.find((v) => v.lang?.toLowerCase() === tag) ??
    all.find((v) => v.lang?.toLowerCase().startsWith(`${base}-`)) ??
    all.find((v) => v.lang?.toLowerCase() === base) ??
    null
  );
}

function errorKind(raw: string | undefined): RecognitionErrorKind {
  if (raw === "no-speech") return "no-speech";
  if (raw === "not-allowed" || raw === "service-not-allowed") return "not-allowed";
  if (raw === "network") return "network";
  return "unknown";
}

export const browserSpeechProvider: SpeechProvider = {
  id: "browser",

  isRecognitionSupported() {
    // Per-language recognition support can't be probed without asking
    // for the mic, so this reports engine availability. A language the
    // device can't handle surfaces as a recognition error, which the UI
    // shows rather than swallowing.
    return recognitionCtor() !== null;
  },

  isSynthesisSupported(locale) {
    return synth() !== null && voiceFor(locale) !== null;
  },

  startRecognition(locale, handlers: RecognitionHandlers): RecognitionSession | null {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      handlers.onError("unsupported");
      return null;
    }

    const rec = new Ctor();
    rec.lang = SPEECH_LANG_TAG[locale];
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (transcript.trim() !== "") handlers.onResult(transcript, result.isFinal);
      }
    };
    rec.onerror = (event) => handlers.onError(errorKind(event?.error));
    rec.onend = () => handlers.onEnd();

    try {
      rec.start();
    } catch {
      // start() throws if a session is already running; treat it as a
      // failed attempt rather than leaving the UI stuck in "listening".
      handlers.onError("unknown");
      return null;
    }

    return {
      stop: () => {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      },
      abort: () => {
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }
    };
  },

  speak(text, locale) {
    const s = synth();
    const voice = voiceFor(locale);
    // Refusing to speak without a matching voice is deliberate: the
    // browser would otherwise read Tamil text with an English voice,
    // which is worse than showing the text and saying so.
    if (!s || !voice || text.trim() === "") return Promise.resolve();

    return new Promise<void>((resolve) => {
      s.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang || SPEECH_LANG_TAG[locale];
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      s.speak(utterance);
    });
  },

  cancelSpeaking() {
    try {
      synth()?.cancel();
    } catch {
      /* nothing to cancel */
    }
  }
};
