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
  const [state, formAction, pending] = useActionState(
    registerAction,
    {} as RegisterState,
  );

  /**
   * The registration result whose automatic sign-in failed, held by identity rather than
   * as a boolean: `useActionState` hands back a fresh object per submission, so a retry
   * is a different result and clears this on its own — no effect needed to reset it.
   */
  const [signInFailedFor, setSignInFailedFor] = useState<RegisterState | null>(null);

  /**
   * Busy from the moment the form is submitted until the user is either signed in or
   * told what went wrong. Derived rather than mirrored into state by an effect: an
   * effect updates it a frame late, which shows as the modal flickering between the
   * action finishing and the sign-in starting.
   */
  const isRedirecting =
    pending || (state?.success === true && signInFailedFor !== state);
  const isBusy = isRedirecting;

  // Registration succeeded — sign the new user in with the credentials still in the form
  // and send them on. Every failure path records *which* result failed, so the modal
  // closes and the form becomes usable again instead of spinning forever.
  useEffect(() => {
    if (!state?.success) return;

    void (async () => {
      const form = document.getElementById("register-form") as HTMLFormElement | null;
      if (!form) {
        setSignInFailedFor(state);
        return;
      }

      const email = (form.elements.namedItem("email") as HTMLInputElement).value;
      const password = (form.elements.namedItem("password") as HTMLInputElement).value;

      const result = await authClient.signIn
        .email({ email, password })
        .catch(() => null);

      if (!result || result.error) {
        setSignInFailedFor(state);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    })();
  }, [state, router]);

  return (
    <>
      <LoadingModal
        open={isRedirecting}
        variant="minimal"
        title="Creating your account"
        description="Setting up your organization and signing you in."
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
