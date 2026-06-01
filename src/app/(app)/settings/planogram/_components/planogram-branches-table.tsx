"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface PlanogramBranchRow {
  id: string;
  name: string;
  sapCode: string;
}

interface PlanogramBranchesTableProps {
  branches: PlanogramBranchRow[];
}

export function PlanogramBranchesTable({ branches }: PlanogramBranchesTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      branches.filter((branch) =>
        matchesTableSearch(query, [branch.name, branch.sapCode]),
      ),
    [branches, query],
  );

  if (branches.length === 0) {
    return (
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by branch name or SAP code…"
        />
        <DataTableEmpty message="No branches available for your account." />
      </DataTableShell>
    );
  }

  return (
    <DataTableShell>
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Search by branch name or SAP code…"
      />
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[45%]">Branch</TableHead>
              <TableHead className="w-[35%]">SAP code</TableHead>
              <TableHead className="w-[20%] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No branches match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {branch.sapCode}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/settings/branches/${branch.id}/planogram`}>
                        Open
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableScroll>
    </DataTableShell>
  );
}
