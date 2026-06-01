import Link from "next/link";

interface AuthPageHeaderProps {
  title: string;
  description: string;
}

export function AuthPageHeader({ title, description }: AuthPageHeaderProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

interface AuthPageFooterProps {
  children: React.ReactNode;
}

export function AuthPageFooter({ children }: AuthPageFooterProps) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

interface AuthPageLinkProps {
  href: string;
  children: React.ReactNode;
}

export function AuthPageLink({ href, children }: AuthPageLinkProps) {
  return (
    <Link
      href={href}
      className="font-semibold text-foreground underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
