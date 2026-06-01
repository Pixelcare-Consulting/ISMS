"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { loginSchema, type LoginInput } from "@/features/auth/schemas/auth.schema";
import { AppVersion } from "@/app/(auth)/_components/app-version";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/utils/cn";

const inputClassName = cn(
  "h-11 rounded-lg border-border/80 bg-muted/40 px-3.5 shadow-none",
  "placeholder:text-muted-foreground/70",
  "focus-visible:bg-background focus-visible:ring-primary/30",
);

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("error") === "session-expired";
  const [error, setError] = useState<string | null>(
    sessionExpired
      ? "Your session is no longer valid. Sign in again."
      : null,
  );
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: LoginInput) {
    setError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputClassName}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium">Password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputClassName}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          className="h-11 w-full rounded-lg text-sm font-semibold shadow-sm"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        <AppVersion className="w-full pt-1" />
      </form>
    </Form>
  );
}
