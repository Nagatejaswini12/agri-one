import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * The floating way into the assistant.
 *
 * A button pinned over a scrolling page always covers something. On a
 * phone it was sitting on top of a card's text, so it now steps aside
 * while the farmer is scrolling down through content and comes back as
 * soon as they stop or scroll up. It also sits above the bottom
 * navigation and inside the device's safe area rather than over either.
 *
 * Reduced motion is honoured: the button still hides and returns, it
 * just does so without sliding.
 *
 * This is presentation only. It links to /voice-ai exactly as before and
 * knows nothing about what the assistant does.
 */
export function AssistantButton() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY.current + 4;
      const goingUp = y < lastY.current - 4;

      // Only retreat once there is something scrolled past; near the top
      // there is nothing to uncover.
      if (goingDown && y > 120) setHidden(true);
      else if (goingUp) setHidden(false);

      lastY.current = y;

      // Come back when scrolling stops, so it is never hidden at rest.
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setHidden(false), 900);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  return (
    <NavLink
      to="/voice-ai"
      aria-label={t("nav.voiceAi")}
      style={{
        // Clear of the phone bar and of the device's own inset. The bar
        // is hidden from `lg` up, where the stages move into the header,
        // so the button drops to a normal corner offset there.
        bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))"
      }}
      className={`fixed right-3 z-30 flex h-14 w-14 lg:!bottom-6 items-center justify-center rounded-full border border-white/70 bg-white/85 shadow-lg ring-1 ring-black/5 backdrop-blur transition-[transform,opacity] duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 motion-reduce:transition-none sm:right-5 sm:h-16 sm:w-16 ${
        hidden ? "pointer-events-none translate-y-24 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      {/* The assistant's own artwork rather than a glyph, so the one
          control that floats over every screen belongs to the same
          visual family as the cards. */}
      <img
        src="/agents/voice.webp"
        alt=""
        aria-hidden="true"
        width={224}
        height={224}
        className="h-10 w-10 object-contain sm:h-11 sm:w-11"
      />
    </NavLink>
  );
}
