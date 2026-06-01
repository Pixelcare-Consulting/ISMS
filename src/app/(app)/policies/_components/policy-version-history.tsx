"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/features/policies/constants/policy-status";

interface VersionRow {
  id: string;
  version: number;
  status: string;
  content: string;
  createdAt: Date;
  authorName: string;
}

interface PolicyVersionHistoryProps {
  versions: VersionRow[];
  selectedVersion: number;
  onSelectVersion: (version: number) => void;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "review") return "secondary";
  return "outline";
}

export function PolicyVersionHistory({
  versions,
  selectedVersion,
  onSelectVersion,
}: PolicyVersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              data-state={row.version === selectedVersion ? "selected" : undefined}
              onClick={() => onSelectVersion(row.version)}
            >
              <TableCell className="font-medium">v{row.version}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(row.status)}>
                  {POLICY_STATUS_LABELS[row.status as PolicyStatus] ?? row.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.authorName}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(row.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
