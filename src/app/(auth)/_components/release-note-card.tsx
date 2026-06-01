import { Badge } from "@/components/ui/badge";
import { type ReleaseChangeType, type ReleaseNote } from "@/content/releases";
import { formatReleaseDate, formatVersionLabel } from "@/lib/shared/version";
import { cn } from "@/utils/cn";

const changeTypeLabels: Record<ReleaseChangeType, string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
};

const latestBadgeClassName =
  "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300";

const changeTypeBadgeClassName: Record<ReleaseChangeType, string> = {
  feature:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-300",
  fix: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  improvement:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/80 dark:text-violet-300",
};

interface ReleaseNoteCardProps {
  release: ReleaseNote;
  isLatest?: boolean;
}

export function ReleaseNoteCard({ release, isLatest = false }: ReleaseNoteCardProps) {
  return (
    <article className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{release.title}</h2>
          {isLatest ? (
            <Badge variant="outline" className={latestBadgeClassName}>
              Latest
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatVersionLabel(release.version)} · {formatReleaseDate(release.date)}
        </p>
      </div>

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
