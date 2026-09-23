import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportedLanguage } from "@agri-one/shared-types";
import { browserSpeechProvider } from "@/lib/speech/browserSpeechProvider";
import type { RecognitionErrorKind, RecognitionSession, SpeechProvider } from "@/lib/speech/types";

/**
 * React wrapper around the active SpeechProvider.
 *
 * Capabilities are re-checked whenever the language changes, because a
 * device may have a Hindi voice and no Tamil one — the answer is still
 * shown as text either way, with a notice.
 */
export function useSpeech(locale: SupportedLanguage, provider: SpeechProvider = browserSpeechProvider) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [recognitionError, setRecognitionError] = useState<RecognitionErrorKind | null>(null);
  const [canSynthesise, setCanSynthesise] = useState(false);

  const sessionRef = useRef<RecognitionSession | null>(null);
  const canRecognise = provider.isRecognitionSupported(locale);

  // Voices load asynchronously in Chrome, so the first check can say
  // "no voice" before the list arrives. Re-check briefly on mount and on
  // every language change.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!cancelled) setCanSynthesise(provider.isSynthesisSupported(locale));
    };
    check();
    const timers = [setTimeout(check, 250), setTimeout(check, 1000)];
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [locale, provider]);

  // Never leave the device listening or talking after the page unmounts.
  useEffect(
    () => () => {
      sessionRef.current?.abort();
      provider.cancelSpeaking();
    },
    [provider]
  );

  const stopListening = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(
    (onFinal: (text: string) => void) => {
      if (!canRecognise || listening) return;
      setRecognitionError(null);
      setInterim("");
      setListening(true);

      sessionRef.current = provider.startRecognition(locale, {
        onResult: (text, isFinal) => {
          if (isFinal) {
            setInterim("");
            onFinal(text.trim());
          } else {
            setInterim(text);
          }
        },
        onError: (kind) => {
          setRecognitionError(kind);
          setInterim("");
          setListening(false);
        },
        onEnd: () => {
          setInterim("");
          setListening(false);
          sessionRef.current = null;
        }
      });

      if (!sessionRef.current) setListening(false);
    },
    [canRecognise, listening, locale, provider]
  );

  /** Speaks exactly the string passed in — the one already on screen. */
  const speak = useCallback(
    async (text: string) => {
      if (!canSynthesise) return;
      setSpeaking(true);
      try {
        await provider.speak(text, locale);
      } finally {
        setSpeaking(false);
      }
    },
    [canSynthesise, locale, provider]
  );

  const stopSpeaking = useCallback(() => {
    provider.cancelSpeaking();
    setSpeaking(false);
  }, [provider]);

  return {
    canRecognise,
    canSynthesise,
    listening,
    speaking,
    interim,
    recognitionError,
    startListening,
    stopListening,
    speak,
    stopSpeaking
  };
}
