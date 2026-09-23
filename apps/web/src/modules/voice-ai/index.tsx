import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ChatMessage, DecisionSourceAgent } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useSoilRecords } from "@/modules/soil-water/hooks";
import { useScans } from "@/modules/scan-crop/hooks";
import { useAskChat } from "@/modules/voice-ai/hooks";
import { renderAnswer } from "@/modules/voice-ai/renderAnswer";
import { useSpeech } from "@/lib/speech/useSpeech";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { SUPPORTED_LANGUAGES } from "@/i18n";

/** Same mapping the briefing uses, so a chip leads where a farmer expects. */
const SOURCE_ROUTE: Record<DecisionSourceAgent, string> = {
  weather: "/weather",
  market: "/market",
  schemes: "/schemes",
  diagnosis: "/scan-history",
  soil: "/soil-water",
  farm: "/farms"
};

let messageSeq = 0;
const nextId = () => {
  messageSeq += 1;
  return `m${messageSeq}-${Date.now()}`;
};

function SourceChips({ sources }: { sources: DecisionSourceAgent[] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {sources.map((s) => (
        <Link
          key={s}
          to={SOURCE_ROUTE[s]}
          className="text-xs font-medium text-green-700 underline"
        >
          {t(`decision.signal.${s}`)} ›
        </Link>
      ))}
    </div>
  );
}

export default function VoiceAiPage() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  const { data: farms, isLoading: farmsLoading } = useFarms();
  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) setActiveFarmId(farms[0].id);
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const { data: crops } = useFarmCrops(activeFarmId ?? undefined);
  const { data: soilRecords } = useSoilRecords(activeFarmId ?? undefined);
  const { data: scans } = useScans(activeFarmId ?? undefined);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const ask = useAskChat();
  const speech = useSpeech(language);

  const languageLabel = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? language,
    [language]
  );

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, ask.isPending]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (question === "" || ask.isPending) return;

      setDraft("");
      setLastQuestion(question);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text: question, answer: null, at: new Date().toISOString() }
      ]);

      const result = await ask.mutateAsync({
        text: question,
        farm: activeFarm,
        crops,
        soilRecords,
        scans,
        primaryCrop: crops?.find((c) => c.status === "active")?.cropName ?? null
      });

      if (result.status !== "ok") return;

      // Rendered once. The same string is displayed and spoken, so the
      // written and spoken answers cannot drift apart.
      const rendered = renderAnswer(t, result.data);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: rendered,
          answer: result.data,
          at: new Date().toISOString()
        }
      ]);
      void speech.speak(rendered);
    },
    [activeFarm, ask, crops, scans, soilRecords, speech, t]
  );

  const unavailableReason =
    ask.data && ask.data.status === "unavailable" ? ask.data.reason : null;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("chat.title")}</h1>
        <span className="text-xs text-gray-500">
          {t("chat.languageIndicator", { language: languageLabel })}
        </span>
      </div>

      {farmsLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("chat.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          {/* Capability notices. Never silence: if the device cannot
              speak or listen, the farmer is told why. */}
          {!speech.canRecognise ? (
            <p className="mt-3 rounded border border-dashed p-2 text-xs text-gray-600">
              {t("chat.speechUnsupported")}
            </p>
          ) : null}
          {!speech.canSynthesise ? (
            <p className="mt-2 rounded border border-dashed p-2 text-xs text-gray-600">
              {t("chat.ttsUnavailable", { language: languageLabel })}
            </p>
          ) : null}
          {speech.recognitionError ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {t(`chat.recognitionError.${speech.recognitionError}`, {
                defaultValue: t("chat.recognitionError.unknown")
              })}
            </p>
          ) : null}

          {/* pb clears the sticky composer below, so the newest answer
              is never hidden behind it. */}
          <div className="mt-4 flex-1 space-y-3 pb-28" aria-live="polite">
            {messages.length === 0 && !ask.isPending ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
                <p className="font-medium">{t("chat.helpTitle")}</p>
                <p className="mt-1 whitespace-pre-line">{t("chat.helpBody")}</p>
              </div>
            ) : null}

            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-green-700 p-3 text-sm text-white"
                    : "mr-auto max-w-[90%] rounded-lg border bg-white p-3 text-sm"
                }
              >
                <p className="whitespace-pre-line">{m.text}</p>
                {m.role === "assistant" && m.answer ? (
                  <SourceChips sources={m.answer.sources} />
                ) : null}
              </div>
            ))}

            {ask.isPending ? (
              <p className="mr-auto rounded-lg border bg-white p-3 text-sm text-gray-500">
                {t("chat.thinking")}
              </p>
            ) : null}

            {speech.interim ? (
              <p className="ml-auto max-w-[85%] rounded-lg bg-green-100 p-3 text-sm italic text-green-900">
                {speech.interim}
              </p>
            ) : null}

            {ask.isError ? (
              <DataUnavailable reason={t("chat.loadError")} />
            ) : null}
            {unavailableReason ? <DataUnavailable reason={unavailableReason} /> : null}

            {(ask.isError || unavailableReason) && lastQuestion ? (
              <button
                type="button"
                onClick={() => void send(lastQuestion)}
                className="rounded border px-3 py-1 text-sm font-medium text-green-700"
              >
                {t("chat.retry")}
              </button>
            ) : null}

            <div ref={listEndRef} />
          </div>

          {speech.speaking ? (
            <button
              type="button"
              onClick={speech.stopSpeaking}
              className="mt-3 self-start rounded border px-3 py-1 text-sm font-medium text-green-700"
            >
              {t("chat.stopSpeaking")}
            </button>
          ) : null}

          <form
            className="sticky bottom-16 mt-4 flex items-end gap-2 bg-gray-50 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              {t("chat.inputLabel")}
            </label>
            <input
              id="chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("chat.inputPlaceholder")}
              className="flex-1 rounded border px-3 py-2 text-sm"
              autoComplete="off"
            />

            {/* Rendered only when the engine exists — never a dead button. */}
            {speech.canRecognise ? (
              <button
                type="button"
                aria-label={speech.listening ? t("chat.listening") : t("chat.startListening")}
                aria-pressed={speech.listening}
                onClick={() =>
                  speech.listening
                    ? speech.stopListening()
                    : speech.startListening((text) => void send(text))
                }
                className={`h-10 w-10 shrink-0 rounded-full text-lg ${
                  speech.listening ? "bg-red-600 text-white" : "bg-white text-green-700 border"
                }`}
              >
                🎙️
              </button>
            ) : null}

            <button
              type="submit"
              disabled={draft.trim() === "" || ask.isPending}
              className="h-10 shrink-0 rounded bg-green-700 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("chat.send")}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
