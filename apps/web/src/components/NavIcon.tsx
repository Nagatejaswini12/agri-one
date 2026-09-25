/**
 * Line icons for the stage navigation.
 *
 * Drawn inline rather than pulled from the agent artwork: those renders
 * are detailed 3D pieces that turn to mush at 22px, and an emoji would
 * be a different visual language again. These are plain strokes that
 * inherit `currentColor`, so the active state is just a text colour.
 *
 * They are decorative -- every nav item already carries its translated
 * label -- so they are hidden from assistive technology.
 */
export function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false
  };

  switch (name) {
    case "dashboard": // a house
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      );
    case "plan": // a field, marked out
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 12h18M9 5v14M15 5v14" />
        </svg>
      );
    case "grow": // a seedling
      return (
        <svg {...common}>
          <path d="M12 21v-7" />
          <path d="M12 14c0-3 2.2-5.5 5.5-5.8C17.2 11.6 15.2 14 12 14Z" />
          <path d="M12 16c-3 0-5.3-2-5.6-5C9.6 11.2 11.8 13 12 16Z" />
        </svg>
      );
    case "protect": // a shield
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3Z" />
          <path d="m9.5 12 1.8 1.8 3.4-3.6" />
        </svg>
      );
    case "sell": // a price tag
      return (
        <svg {...common}>
          <path d="M3.5 12.6V5.2a1.7 1.7 0 0 1 1.7-1.7h7.4c.45 0 .88.18 1.2.5l6.2 6.2a1.7 1.7 0 0 1 0 2.4l-7.4 7.4a1.7 1.7 0 0 1-2.4 0L4 13.8a1.7 1.7 0 0 1-.5-1.2Z" />
          <circle cx="8.4" cy="8.4" r="1.4" />
        </svg>
      );
    default:
      return null;
  }
}
