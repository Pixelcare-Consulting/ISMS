import { Suspense } from "react";

import { AuthPageHeader } from "@/app/(auth)/_components/auth-page-shell";
import { LoginForm } from "@/app/(auth)/login/_components/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <AuthPageHeader
        title="Sign in to FINDEN ISMS"
        description="Use your work email to access role-based dashboards, operational KPIs, and actionable alerts for your account and branch."
      />

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
