import { cn } from "@/utils/cn";

interface ReportPreviewProps {
  className?: string;
}

export function ReportPreview({ className }: ReportPreviewProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col gap-1.5 bg-white p-3",
        className,
      )}
    >
      <div className="h-2 w-1/3 rounded-sm bg-slate-200" />
      <div className="h-1.5 w-full rounded-sm bg-slate-100" />
      <div className="h-1.5 w-5/6 rounded-sm bg-slate-100" />
      <div className="mt-1 grid flex-1 grid-cols-3 gap-1">
        <div className="rounded-sm bg-slate-100" />
        <div className="rounded-sm bg-slate-100" />
        <div className="rounded-sm bg-primary/20" />
      </div>
      <div className="h-1.5 w-2/3 rounded-sm bg-slate-100" />
    </div>
  );
}
