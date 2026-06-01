import { cn } from "@/utils/cn";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

interface SettingsFieldProps {
  label: string;
  value: string;
  hint?: string;
}

export function SettingsField({ label, value, hint }: SettingsFieldProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
