import { Badge } from "@/components/ui/badge";

interface RoleUserCountBadgeProps {
  roleName: string;
  userCount: number;
}

export function RoleUserCountBadge({
  roleName,
  userCount,
}: RoleUserCountBadgeProps) {
  const label = `${roleName} (${userCount})`;
  const tooltip =
    userCount === 1
      ? `${label} — 1 user assigned to this role`
      : `${label} — ${userCount} users assigned to this role`;

  return (
    <Badge
      variant="secondary"
      className="h-5 min-w-5 shrink-0 cursor-default justify-center rounded-md px-1.5 py-0 text-[10px] font-medium tabular-nums"
      title={tooltip}
    >
      {userCount}
    </Badge>
  );
}
