"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { loginSchema, type LoginInput } from "@/features/auth/schemas/auth.schema";
import {
  resolvePostLoginDestination,
  safeInternalPath,
  waitForValue,
} from "@/features/auth/lib/post-login-destination";
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
import { LoadingModal } from "@/components/ui/loading-modal";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth/client";
import { queuePendingAuthToast } from "@/lib/auth/pending-auth-toast";
import {
  ALREADY_SIGNED_IN_MESSAGE,
  DISABLED_ACCOUNT_MESSAGE,
  REPLACE_OTHER_SESSIONS_HEADER,
  isAlreadySignedInMessage,
  isDisabledAccountMessage,
  loginErrorMessage,
  shownLoginNotice,
} from "@/lib/auth/session-policy";
import { cn } from "@/utils/cn";

const inputClassName = cn(
  "h-11 rounded-lg border-border/80 bg-muted/40 px-3.5 shadow-none",
  "placeholder:text-muted-foreground/70",
  "focus-visible:bg-background focus-visible:ring-primary/30",
);

type PostLoginUser = {
  name?: string | null;
  isPlatformOperator?: boolean;
  roleSlugs?: string[];
};

/**
 * Full document navigation after sign-in.
 * Soft App Router transitions (router.push + refresh) can hang when leaving
 * `(auth)` for `(provider)` / `(app)`, leaving the signing-in modal stuck.
 *
 * Do not read the new session through a Server Action here: that request can
 * still carry the pre-sign-in cookie snapshot (empty right after a fast
 * sign-out), which looks like "signed in but no workspace".
 */
function navigateAfterLogin(destination: string) {
  window.location.assign(destination);
}

async function readPostLoginUser(): Promise<PostLoginUser | null> {
  const session = await authClient.getSession({
    query: { disableCookieCache: true },
  });
  const user = session.data?.user as PostLoginUser | undefined;
  return user ?? null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(
    loginErrorMessage(searchParams.get("error")),
  );
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const cleanedNotice = useRef(false);
  const callbackUrl = safeInternalPath(searchParams.get("callbackUrl")) ?? "/dashboard";

  useEffect(() => {
    if (cleanedNotice.current) return;
    const visit = shownLoginNotice({
      pathname: window.location.pathname,
      search: window.location.search,
    });
    if (!visit) return;
    cleanedNotice.current = true;
    // Drop the error query in place so a refresh does not ask for ?error=idle again.
    window.history.replaceState(window.history.state, "", visit.href);
    void (async () => {
      try {
        // A leftover cookie would send a clean /login into the app, which signs out and returns here.
        await authClient.signOut({ fetchOptions: { credentials: "include" } });
      } catch {
        // The notice still stands when the cookie is already gone.
      }
      router.replace(visit.href, { scroll: false });
    })();
  }, [router]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const isBusy = isSubmitting || isRedirecting;

  async function onSubmit(values: LoginInput, replaceOtherSessions = false) {
    setError(null);
    setIsRedirecting(true);

    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      fetchOptions: {
        credentials: "include",
        headers: replaceOtherSessions
          ? { [REPLACE_OTHER_SESSIONS_HEADER]: "1" }
          : undefined,
      },
    });

    if (result.error) {
      setIsRedirecting(false);
      if (isAlreadySignedInMessage(result.error.message)) {
        setAlreadySignedIn(true);
        setError(ALREADY_SIGNED_IN_MESSAGE);
        return;
      }
      if (isDisabledAccountMessage(result.error.message)) {
        setAlreadySignedIn(false);
        setError(DISABLED_ACCOUNT_MESSAGE);
        return;
      }
      setAlreadySignedIn(false);
      setError(
        result.error.message?.includes("Too many")
          ? result.error.message
          : "Invalid email or password. Please try again.",
      );
      return;
    }
    setAlreadySignedIn(false);

    try {
      const signedInUser = (result.data as { user?: PostLoginUser } | undefined)?.user;
      const sessionUser = await waitForValue(readPostLoginUser);
      const user = sessionUser ?? signedInUser ?? null;

      queuePendingAuthToast({
        kind: "welcome",
        name: user?.name,
      });

      // Sign-in already succeeded. Always open the workspace with a full page
      // load so newly set cookies are sent, even if getSession raced.
      navigateAfterLogin(
        resolvePostLoginDestination({
          isPlatformOperator: Boolean(user?.isPlatformOperator),
          roleSlugs: user?.roleSlugs,
          callbackUrl,
        }),
      );
    } catch {
      queuePendingAuthToast({ kind: "welcome" });
      navigateAfterLogin(
        resolvePostLoginDestination({
          isPlatformOperator: false,
          callbackUrl,
        }),
      );
    }
  }

  return (
    <>
      <LoadingModal
        open={isRedirecting}
        variant="minimal"
        title="Signing you in"
        description="Verifying your credentials and loading your workspace."
      />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => onSubmit(values, false))}
          className="space-y-5"
        >
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
                    disabled={isBusy}
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
                    disabled={isBusy}
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
            disabled={isBusy}
          >
            {isBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          {/* DO NOT UNCOMMENT THIS WE DONT NEED THIS TO DISPLAY {alreadySignedIn ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-lg text-sm font-semibold"
              disabled={isBusy}
              onClick={() => {
                void form.handleSubmit((values) => onSubmit(values, true))();
              }}
            >
              Sign out the other device and continue here
            </Button>
          ) : null} */}

          <AppVersion className="w-full pt-1" />
        </form>
      </Form>
    </>
  );
}
