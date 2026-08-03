import { Badge } from "@/components/ui/badge";
import { statusColorClassName } from "@/features/reason-status/constants/status-colors";
import { cn } from "@/utils/cn";

interface StatusCodeBadgeProps {
  code: string;
  name: string;
  /** Palette key from ReasonStatusCode.color (optional — falls back by code). */
  color?: string | null;
  /** Show technical code suffix (e.g. pending_tl). Off by default in operational views. */
  showCode?: boolean;
  className?: string;
}

export function StatusCodeBadge({
  code,
  name,
  color,
  showCode = false,
  className,
}: StatusCodeBadgeProps) {
  const variant = statusColorClassName(color, code);

  return (
    <Badge variant="outline" className={cn("font-normal", variant, className)}>
      {name}
      {showCode ? (
        <span className="ml-1.5 font-mono text-[10px] opacity-70">{code}</span>
      ) : null}
    </Badge>
  );
}

/** Active / Inactive for Settings → Status (not a workflow code). */
export function RecordStatusBadge({
  status,
}: {
  status: "active" | "inactive";
}) {
  const active = status === "active";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
