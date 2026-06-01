import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";

/** Set to `true` when the public marketing landing page should be live again. */
const LANDING_PAGE_ENABLED = false;

export default function MarketingPage() {
  if (!LANDING_PAGE_ENABLED) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-semibold">FINDEN ISMS</span>
          <nav className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-1 flex-col justify-center gap-6 px-4 py-24">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          ISO-ready ISMS for growing teams
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Multi-tenant security management: users, roles, audit trails, and a
          roadmap to policies, risks, and compliance.
        </p>
        <div className="flex gap-3">
          <Button size="lg" asChild>
            <Link href="/register">Start free trial</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
