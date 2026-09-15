import type { Metadata } from "next";
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
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            We&apos;ll be back shortly
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {APP_NAME} is temporarily unavailable while we perform scheduled
            maintenance. Please check back in a little while.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Need urgent assistance? Contact {PLATFORM_OPERATOR_NAME} support.
        </p>
      </main>
    </div>
  );
}
