"use client";

import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { registerAction } from "@/features/auth/actions/register.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    if (!state?.success) return;

    const form = document.getElementById("register-form") as HTMLFormElement | null;
    if (!form) return;

    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    void signIn("credentials", {
      email,
      password,
      redirect: false,
    }).then((result) => {
      if (!result?.error) {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }, [state, router]);

  return (
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
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium">
          Your name
        </Label>
        <Input id="name" name="name" placeholder="Jane Doe" className={inputClassName} required />
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
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Creating…
          </>
        ) : (
          "Create organization"
        )}
      </Button>
    </form>
  );
}
