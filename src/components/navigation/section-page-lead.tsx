import { cn } from "@/utils/cn";

interface SectionPageLeadProps {
  children: React.ReactNode;
  className?: string;
}

/** Optional per-tab description below section tabs. */
export function SectionPageLead({ children, className }: SectionPageLeadProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}
