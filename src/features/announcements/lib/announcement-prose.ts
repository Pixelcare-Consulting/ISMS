import { cn } from "@/utils/cn";

/** Shared prose + table styles for editor preview and rendered announcement bodies. */
export const ANNOUNCEMENT_PROSE_CLASS = cn(
  "prose prose-sm max-w-none text-foreground dark:prose-invert",
  "[&_img]:max-h-80 [&_img]:rounded-md",
  "[&_.tableWrapper]:my-3 [&_.tableWrapper]:overflow-x-auto",
  "[&_table]:my-3 [&_table]:w-full [&_table]:min-w-[16rem] [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:align-top [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
);
