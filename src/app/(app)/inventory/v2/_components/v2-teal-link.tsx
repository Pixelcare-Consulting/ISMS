import Link from "next/link";

import { cn } from "@/utils/cn";

interface V2TealLinkProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const linkClass =
  "inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300";

export function V2TealLink({ href, onClick, children, className }: V2TealLinkProps) {
  if (href) {
    return (
      <Link href={href} className={cn(linkClass, className)}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(linkClass, className)}>
      {children}
    </button>
  );
}
