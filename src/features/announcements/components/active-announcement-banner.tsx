import Link from "next/link";
import { Megaphone } from "lucide-react";

type ActiveAnnouncement = {
  id: string;
  title: string;
  body: string;
};

interface ActiveAnnouncementBannerProps {
  announcements: ActiveAnnouncement[];
}

export function ActiveAnnouncementBanner({
  announcements,
}: ActiveAnnouncementBannerProps) {
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-2">
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          className="flex items-start gap-3 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50"
        >
          <Megaphone className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{announcement.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed opacity-90">
              {announcement.body}
            </p>
          </div>
          <Link
            href="/announcements"
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
          >
            View
          </Link>
        </div>
      ))}
    </div>
  );
}
