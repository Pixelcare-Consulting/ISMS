import { CheckCircle2, ShieldCheck } from "lucide-react";

interface AuthShellProps {
  children: React.ReactNode;
}

const highlights = [
  "Unified workflow across branches, supply planning, logistics, and SAP",
  "Forecast-driven replenishment with SKU planogram and MIL management",
  "Serialized inventory tracking with governed approvals and audit trails",
];

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.18),transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--primary)/0.12),transparent_40%)]"
        />

        <div className="relative z-10 flex min-h-dvh w-full flex-col px-10 py-10 xl:px-16 xl:py-12">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/20">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">FINDEN ISMS</p>
              <p className="text-xs text-sidebar-muted">Inventory &amp; Operations Platform</p>
            </div>
          </div>

          <div className="flex flex-1 items-center py-12">
            <div className="max-w-md space-y-6">
              <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
                Unify branch inventory and operations end to end
              </h2>
              <p className="text-sm leading-relaxed text-sidebar-muted">
                Connect branch operations, supply planning, logistics, customer
                service, and SAP with real-time inventory updates and systemwide
                data integrity.
              </p>
              <ul className="space-y-3">
                {highlights.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-xs text-sidebar-muted">
            &copy; {new Date().getFullYear()} FINDEN ISMS
          </p>
        </div>
      </div>

      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 sm:px-10 lg:px-12 xl:px-16">
        <div className="mb-8 flex w-full max-w-[420px] items-center gap-3 lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">FINDEN ISMS</p>
            <p className="text-xs text-muted-foreground">Inventory &amp; Operations Platform</p>
          </div>
        </div>

        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
