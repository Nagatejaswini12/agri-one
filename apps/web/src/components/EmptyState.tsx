import { Link } from "react-router-dom";

/**
 * For "the farmer hasn't entered this yet" — distinct from
 * DataUnavailable, which is for a live external source failing/being
 * unconfigured. Nothing is wrong here, there's just nothing yet.
 *
 * That distinction is why this one stays quiet and offers a way
 * forward, while DataUnavailable states a problem.
 */
export function EmptyState({
  message,
  actionLabel,
  actionTo
}: {
  message: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-agri-mist">
      <p>{message}</p>
      {actionTo && actionLabel ? (
        <Link
          to={actionTo}
          className="agri-button-ghost mt-3 inline-block text-sm text-agri-emerald"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
