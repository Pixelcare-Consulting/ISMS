"use client";

/** Better Auth client does not require a React SessionProvider. */
export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
