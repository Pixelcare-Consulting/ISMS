"use client";

import { Button } from "@/components/ui/button";

interface LogisticsLoadRefsButtonProps {
  onClick: () => void;
}

export function LogisticsLoadRefsButton({ onClick }: LogisticsLoadRefsButtonProps) {
  return (
    <Button variant="outline" type="button" className="w-full sm:w-auto" onClick={onClick}>
      Load branches & warehouses
    </Button>
  );
}
