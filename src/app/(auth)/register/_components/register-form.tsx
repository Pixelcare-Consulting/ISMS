"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { registerAction } from "@/features/auth/actions/register.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingModal } from "@/components/ui/loading-modal";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/utils/cn";

const inputClassName = cn(
  "h-11 rounded-lg border-border/80 bg-muted/40 px-3.5 shadow-none",
  "placeholder:text-muted-foreground/70",
  "focus-visible:bg-background focus-visible:ring-primary/30",
);

type RegisterState = {
  error?: string;
  success?: boolean;
};

export function RegisterForm() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [state, formAction, pending] = useActionState(
    registerAction,
    {} as RegisterState,
  );

  const isBusy = pending || isRedirecting;

  useEffect(() => {
    if (pending) {
      setIsRedirecting(true);
    }
  }, [pending]);

  useEffect(() => {
    if (state?.error) {
      setIsRedirecting(false);
    }
  }, [state?.error]);

  useEffect(() => {
    if (!state?.success) return;

    setIsRedirecting(true);

    const form = document.getElementById("register-form") as HTMLFormElement | null;
    if (!form) {
      setIsRedirecting(false);
      return;
    }

    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    void authClient.signIn
      .email({
        email,
        password,
      })
      .then((result) => {
        if (result.error) {
          setIsRedirecting(false);
          return;
        }
        router.push("/dashboard");
        router.refresh();
      })
      .catch(() => {
        setIsRedirecting(false);
      });
  }, [state, router]);

  return (
    <>
      <LoadingModal
        open={isRedirecting}
        title="Creating your account"
        description="Please wait while we set up your organization and sign you in."
        feedItems={[
          { atSecond: 0, label: "Creating your account", hint: "Organization and admin user" },
          { atSecond: 1, label: "Signing you in", hint: "Starting your session" },
          { atSecond: 2, label: "Loading workspace", hint: "Dashboard and role-based access" },
        ]}
      />
      <form id="register-form" action={formAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="organizationName" className="text-sm font-medium">
            Organization name
          </Label>
          <Input
            id="organizationName"
            name="organizationName"
            placeholder="Acme Corp"
            className={inputClassName}
            required
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Your name
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Jane Doe"
            className={inputClassName}
            required
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            className={inputClassName}
            required
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            className={inputClassName}
            required
            minLength={8}
            disabled={isBusy}
          />
        </div>
        {state?.error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {state.error}
          </div>
        ) : null}
        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-sm font-semibold shadow-sm"
          disabled={isBusy}
        >
          {isBusy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            "Create organization"
          )}
        </Button>
      </form>
    </>
  );
}
