import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { PageTutorialTrigger } from "@/components/page-tutorial/page-tutorial-trigger";
import { cn } from "@/utils/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Clickable ? button beside the title — opens a reusable tutorial dialog */
  tutorial?: PageTutorialContent;
  actions?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  tutorial,
  actions,
  sticky = true,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between",
        sticky &&
          "sticky top-0 z-20 -mx-4 mb-2 border-b border-border/60 bg-background px-4 py-4 shadow-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {tutorial ? <PageTutorialTrigger content={tutorial} /> : null}
        </div>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
