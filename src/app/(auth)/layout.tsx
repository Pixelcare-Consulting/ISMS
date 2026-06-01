import { AuthShell } from "@/app/(auth)/_components/auth-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
