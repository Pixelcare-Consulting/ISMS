import { cn } from "@/utils/cn";

const MANILA_TZ = "Asia/Manila";

interface AnnouncementDateBoxProps {
  date: Date | string;
  className?: string;
}

function dateParts(value: Date | string): {
  month: string;
  day: string;
  year: string;
  isoDate: string | null;
  label: string;
} {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    return {
      month: "—",
      day: "—",
      year: "—",
      isoDate: null,
      label: "Unknown date",
    };
  }

  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    month: "short",
  })
    .format(d)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    day: "numeric",
  }).format(d);
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    year: "numeric",
  }).format(d);
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);

  return { month, day, year, isoDate, label };
}

/** Compact calendar badge: MONTH / DAY / YEAR for announcement list headers. */
export function AnnouncementDateBox({
  date,
  className,
}: AnnouncementDateBoxProps) {
  const { month, day, year, isoDate, label } = dateParts(date);

  return (
    <time
      dateTime={isoDate ?? undefined}
      aria-label={label}
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-md bg-primary px-1 py-1.5 text-primary-foreground",
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase leading-none tracking-wide">
        {month}
      </span>
      <span className="mt-0.5 text-xl font-bold leading-none tabular-nums">
        {day}
      </span>
      <span className="mt-0.5 text-[10px] font-bold leading-none tabular-nums">
        {year}
      </span>
    </time>
  );
}
