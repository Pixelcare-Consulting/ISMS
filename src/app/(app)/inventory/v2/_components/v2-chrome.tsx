import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

export type V2ChromeScreen = "home" | "branch";

const screenTitles: Record<V2ChromeScreen, string> = {
  home: "All inventory",
  branch: "Branch inventory",
};

interface V2ChromeProps {
  screen: V2ChromeScreen;
  /** Replaces the default screen title (branch identity line). */
  title?: string;
  subtitle?: ReactNode;
  className?: string;
}

export function V2Chrome({ screen, title, subtitle, className }: V2ChromeProps) {
  const heading = title ?? screenTitles[screen];

  return (
    <header className={cn("space-y-2", className)}>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{heading}</h1>
      {subtitle ? (
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}
