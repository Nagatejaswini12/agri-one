import type { ReactNode } from "react";
import { accentFor } from "@/app/theme";

/**
 * The glass tray a page's farm / crop selectors sit in.
 *
 * Left bare, a select on this background reads as something that fell
 * out of the layout — it is the one control on most pages and it had no
 * surface under it. This gives it the same dark glass every card uses,
 * plus a low field of the module's own accent so the tray belongs to
 * the page it is on.
 *
 * Purely a container. It renders its children and nothing else: no
 * value, no state, no data. Wrapping a selector in it cannot change
 * what that selector does or what the page fetches.
 *
 * Children keep their own flow — a label above its control, as the
 * pages already had them. An earlier version made this a flex row,
 * which turned each label and its select into siblings and stood them
 * side by side; the label is a label, not a prefix.
 */
export function SelectorPanel({
  id,
  children,
  className = ""
}: {
  /** Module id, for the accent. */
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const accent = accentFor(id);

  return (
    <div className={`agri-card relative mt-3 overflow-hidden ring-1 ${accent.ring} ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -left-10 -top-12 h-32 w-32 rounded-full blur-2xl ${accent.glow}`}
      />
      {/* The select is given room to grow to the panel's width on a
          phone, where a control sized to its longest option can
          otherwise overflow a 390px screen. */}
      <div className="relative p-4 [&>select]:mt-1.5 [&>select]:w-full sm:[&>select]:w-auto sm:[&>select]:min-w-[16rem]">
        {children}
      </div>
    </div>
  );
}
