"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, KeyRound, LayoutDashboard, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/utils/cn";

const NAV = [
  { href: "/provider", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/provider/tenants", label: "Tenants", icon: Building2 },
  { href: "/provider/permissions", label: "Permissions", icon: KeyRound },
] as const;

interface ProviderShellProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
  children: React.ReactNode;
}

export function ProviderShell({ user, children }: ProviderShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              Provider Console
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.name ?? user.email ?? "Platform operator"}
            </p>
          </div>

          <nav className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
