import {
  AuthPageFooter,
  AuthPageHeader,
  AuthPageLink,
} from "@/app/(auth)/_components/auth-page-shell";
import { RegisterForm } from "@/app/(auth)/register/_components/register-form";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Register",
  "Create your organization. You will be assigned the Tenant Admin role.",
);

export default function RegisterPage() {
  return (
    <div className="space-y-8">
      <AuthPageHeader
        title="Create your organization"
        description="You will be assigned the Tenant Admin role."
      />

      <RegisterForm />

      <AuthPageFooter>
        Already have an account? <AuthPageLink href="/login">Sign in</AuthPageLink>
      </AuthPageFooter>
    </div>
  );
}
