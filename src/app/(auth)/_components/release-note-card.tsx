import { Badge } from "@/components/ui/badge";
import { type ReleaseChangeType, type ReleaseNote } from "@/content/releases";
import {
  formatReleaseTimestamp,
  formatVersionLabel,
} from "@/lib/shared/version";
import { cn } from "@/utils/cn";

const changeTypeLabels: Record<ReleaseChangeType, string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
};

const newBadgeClassName =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-300";

const changeTypeBadgeClassName: Record<ReleaseChangeType, string> = {
  feature:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-300",
  fix: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  improvement:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/80 dark:text-violet-300",
};

interface ReleaseNoteCardProps {
  release: ReleaseNote;
  /** True for the first (newest) entry in RELEASES — drives the release-level NEW badge. */
  isLatest?: boolean;
}

export function ReleaseNoteCard({ release, isLatest = false }: ReleaseNoteCardProps) {
  const releaseTimestamp = formatReleaseTimestamp(
    release.date,
    release.releasedAt,
  );
  const dateTimeValue = release.releasedAt ?? release.date;

  return (
    <article className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{release.title}</h2>
          {isLatest ? (
            <Badge variant="outline" className={newBadgeClassName}>
              NEW
            </Badge>
          ) : null}
        </div>
        <p
          className="text-sm text-muted-foreground"
          title={dateTimeValue}
        >
          <span className="font-medium text-foreground/80">
            {formatVersionLabel(release.version)}
          </span>
          <span aria-hidden="true"> · </span>
          <time dateTime={dateTimeValue}>{releaseTimestamp}</time>
        </p>
      </header>

      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {release.highlights.map((highlight) => (
          <li key={highlight}>{highlight}</li>
        ))}
      </ul>

      {release.changes?.length ? (
        <ul className="space-y-2">
          {release.changes.map((change) => (
            <li
              key={`${release.version}-${change.description}`}
              className="flex items-start gap-2 text-sm"
            >
              <Badge
                variant="outline"
                className={cn(
                  "mt-0.5 shrink-0",
                  changeTypeBadgeClassName[change.type],
                )}
              >
                {changeTypeLabels[change.type]}
              </Badge>
              <span className="text-muted-foreground">{change.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
