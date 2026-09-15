import type { Metadata } from "next";
import { ShieldCheck, Wrench } from "lucide-react";

import { AppVersion } from "@/app/(auth)/_components/app-version";
import { PLATFORM_OPERATOR_NAME } from "@/config/platform";
import { APP_NAME } from "@/lib/shared/constants";

export const metadata: Metadata = {
  title: "Under maintenance",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.12),transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--primary)/0.08),transparent_40%)]"
      />

      <main className="relative z-10 flex w-full max-w-[460px] flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">
              Inventory &amp; Operations Platform
            </p>
          </div>
        </div>

        <div className="flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Wrench className="size-7 text-primary" aria-hidden />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            We&apos;ll be back shortly
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {APP_NAME} is temporarily unavailable while we perform scheduled
            maintenance. Access to the system is paused and no data has been
            affected. Please check back in a little while.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Need urgent assistance? Contact {PLATFORM_OPERATOR_NAME} support.
        </p>

        <AppVersion interactive={false} />
      </main>
    </div>
  );
}
