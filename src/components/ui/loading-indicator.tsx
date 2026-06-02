import { Loader2 } from "lucide-react";

import { cn } from "@/utils/cn";

interface LoadingIndicatorProps {
  label?: string;
  className?: string;
  spinnerClassName?: string;
}

export function LoadingIndicator({
  label = "Loading...",
  className,
  spinnerClassName,
}: LoadingIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className={cn("size-4 animate-spin", spinnerClassName)} />
      <span>{label}</span>
    </span>
  );
}
