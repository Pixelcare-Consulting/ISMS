import { cn } from "@/utils/cn";

/** Legacy-style red count badge for sidebar (e.g. unread announcements, STK qty). */
export function SidebarNavCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "mt-0.5 ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white tabular-nums",
        className,
      )}
      aria-label={`${count}`}
    >
      {label}
    </span>
  );
}
