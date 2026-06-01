import { cn } from "@/utils/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  sticky?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  sticky = true,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        sticky &&
          "sticky top-0 z-20 -mx-4 mb-2 border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
      )}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
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
