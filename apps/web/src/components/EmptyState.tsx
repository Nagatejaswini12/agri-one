import { Link } from "react-router-dom";

/**
 * For "the farmer hasn't entered this yet" — distinct from
 * DataUnavailable, which is for a live external source failing/being
 * unconfigured. Nothing is wrong here, there's just nothing yet.
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
    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
      <p>{message}</p>
      {actionTo && actionLabel ? (
        <Link to={actionTo} className="mt-3 inline-block font-medium text-green-700 underline">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
