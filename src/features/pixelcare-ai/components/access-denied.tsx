import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PixelcareAiAccessDenied(props: {
  reason: "allowlist";
}) {
  let message: string;
  switch (props.reason) {
    case "allowlist":
      message =
        "Pixelcare AI is on, but this account is not on the optional allowlist. Clear PIXELCARE_AI_USER_IDS for all signed-in users, or add your user id/email.";
      break;
    default: {
      const _exhaustive: never = props.reason;
      message = `Pixelcare AI access denied (${_exhaustive}).`;
      break;
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-4 overflow-y-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Tools still respect your normal branch and module permissions when access is
        granted.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
