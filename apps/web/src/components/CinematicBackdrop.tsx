import { useEffect, useRef, useState } from "react";
import type { PageVideo } from "@/app/pageMedia";
import { accentFor } from "@/app/theme";

/**
 * The moving surface behind a hero.
 *
 * Where real footage exists it plays; where it does not, the same slot
 * is filled by three drifting fields of the module's own accent. Both
 * end up the same shape and the same weight, so a page without video
 * does not read as a page missing something.
 *
 * Video is only ever attached once we have decided it is welcome. It is
 * skipped when the device asks for reduced motion, and when the browser
 * reports data saver or a slow connection — a farmer on a metered rural
 * connection should not be charged half a megabyte for decoration they
 * did not ask for. The poster still carries the hero in every one of
 * those cases, so nothing is lost but the movement.
 */
export function CinematicBackdrop({
  id,
  video,
  className = "",
  strength = "normal"
}: {
  id: string;
  video?: PageVideo | null;
  className?: string;
  /**
   * "strong" lifts the accent field for an accent that would otherwise
   * be lost against the page's own warm background gradient. It changes
   * how much of the hue shows, never which hue.
   */
  strength?: "normal" | "strong";
}) {
  const accent = accentFor(id);
  const strong = strength === "strong";
  const [playVideo, setPlayVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!video) return;
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduced?.matches) return;

    // Not in every browser, so absence means "no reason to hold back".
    const conn = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /(^|-)(2g|slow-2g)$/.test(conn.effectiveType)) return;

    setPlayVideo(true);

    // If the preference changes while the page is open, honour it.
    const onChange = (e: MediaQueryListEvent) => setPlayVideo(!e.matches);
    reduced?.addEventListener?.("change", onChange);
    return () => reduced?.removeEventListener?.("change", onChange);
  }, [video]);

  useEffect(() => {
    if (!playVideo) videoRef.current?.pause();
  }, [playVideo]);

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {video ? (
        <>
          <img
            src={video.poster}
            alt=""
            className="h-full w-full object-cover"
            width={1280}
            height={720}
            // Lowercase on purpose: this React version passes the
            // camelCase form straight through to the DOM and warns.
            {...{ fetchpriority: "high" }}
          />
          {playVideo ? (
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              poster={video.poster}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              tabIndex={-1}
            >
              {video.sources.map((s) => (
                <source key={s.src} src={s.src} type={s.type} />
              ))}
            </video>
          ) : null}
        </>
      ) : (
        /* No footage for this module: slow fields of its accent over the
           bark surface. Same visual weight as video, none of the bytes. */
        <div className="absolute inset-0 overflow-hidden bg-agri-bark">
          <span
            className={`absolute -left-1/4 top-[-40%] h-[150%] w-[85%] rounded-full blur-3xl animate-drift ${accent.glow} ${
              strong ? "opacity-100" : "opacity-70"
            }`}
          />
          <span
            className={`absolute -right-1/4 bottom-[-45%] h-[150%] w-[80%] rounded-full blur-3xl animate-drift-slow ${
              strong ? accent.glow : "bg-agri-emerald/15"
            }`}
          />
          {/* A second, tighter field under where the artwork sits, so a
              transparent render has something to separate from. */}
          {strong ? (
            <span
              className={`absolute right-[6%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full blur-2xl ${accent.glow}`}
            />
          ) : null}
          <span className="absolute inset-0 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(255,255,255,0.07),transparent_70%)]" />
        </div>
      )}

      {/* The scrim. Copy sits over moving footage or moving colour, so
          it carries its own contrast rather than trusting whatever
          frame happens to be showing.
          Weighted at the bottom-left, where the text actually is, and
          left thin over the rest — a scrim heavy enough to cover the
          whole frame buys legibility by throwing away the footage the
          hero exists to show. */}
      <div className="absolute inset-0 bg-gradient-to-t from-agri-night via-agri-night/45 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-agri-night/70 via-agri-night/10 to-transparent" />
    </div>
  );
}
