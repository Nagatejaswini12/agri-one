import { useEffect, useRef, useState } from "react";

/**
 * The dashboard's hero: a poster image that may become a video.
 *
 * Poster first, always. The video is only attached once we have decided
 * it is welcome, so a farmer on a metered rural connection is never
 * charged half a megabyte for decoration they did not ask for. It is
 * skipped entirely when:
 *
 *   - the device asks for reduced motion
 *   - the browser reports a slow connection or data saver
 *
 * Those checks are why this is a component and not a bare <video>.
 */
export function HeroVideo({
  poster,
  sources,
  alt,
  className = "",
  children
}: {
  poster: string;
  sources: { src: string; type: string }[];
  alt: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [playVideo, setPlayVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!playVideo) videoRef.current?.pause();
  }, [playVideo]);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-green-900 ${className}`}>
      <img
        src={poster}
        alt={alt}
        className="h-full w-full object-cover"
        width={1280}
        height={720}
        // Lowercase on purpose: this React version passes the camelCase
        // form straight through to the DOM and warns about it.
        {...{ fetchpriority: "high" }}
      />

      {playVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        >
          {sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      ) : null}

      {/* Scrim: the copy sits on moving footage, so it needs its own
          contrast rather than relying on whatever frame is showing. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10"
      />

      {children ? <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">{children}</div> : null}
    </div>
  );
}
