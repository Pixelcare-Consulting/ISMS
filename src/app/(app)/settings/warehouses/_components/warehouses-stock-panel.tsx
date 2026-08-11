"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Package, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchesTableSearch } from "@/utils/match-table-search";

interface WarehouseStockLinkRow {
  id: string;
  code: string;
  name: string;
  isMain: boolean;
}

export function WarehousesStockPanel({
  warehouses,
}: {
  warehouses: WarehouseStockLinkRow[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      warehouses.filter((warehouse) =>
        matchesTableSearch(query, [warehouse.code, warehouse.name]),
      ),
    [warehouses, query],
  );

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Warehouse stock</h2>
        <p className="text-sm text-muted-foreground">
          Browse serial numbers held in warehouse locations. Setup (codes and
          aisles) stays on the Warehouses tab — stock is a read-only Inventory
          list.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/inventory/warehouse-stock">
            <Package className="mr-1 h-4 w-4" />
            Browse all warehouse stock
          </Link>
        </Button>
      </div>

      {warehouses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a warehouse on the Warehouses tab first, then open stock for it
          here.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by code or name…"
              className="pl-8"
              aria-label="Search warehouses"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No warehouses match your search.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {filtered.map((warehouse) => (
                <li
                  key={warehouse.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">
                      {warehouse.code}
                      {warehouse.isMain ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Main
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {warehouse.name}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/inventory/warehouse-stock?warehouse=${warehouse.id}`}
                    >
                      View stock
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
