"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createBrandAction,
  createCategoryAction,
} from "@/features/master-data/actions/master-data.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MasterDataBrandsPanelProps {
  brands: { id: string; code: string | null; name: string }[];
  categories: { id: string; name: string }[];
}

export function MasterDataBrandsPanel({ brands, categories }: MasterDataBrandsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [brandCode, setBrandCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");

  function addBrand() {
    startTransition(async () => {
      const result = await createBrandAction({ name: brandName, code: brandCode || undefined });
      if (result.error) {
        toast.error("Could not add brand");
        return;
      }
      toast.success("Brand added");
      setBrandCode("");
      setBrandName("");
      router.refresh();
    });
  }

  function addCategory() {
    startTransition(async () => {
      const result = await createCategoryAction({ name: catName });
      if (result.error) {
        toast.error("Could not add category");
        return;
      }
      toast.success("Category added");
      setCatCode("");
      setCatName("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border p-4">
        <h3 className="font-medium">Brands</h3>
        <div className="flex flex-wrap gap-2">
          <div>
            <Label>Code</Label>
            <Input value={brandCode} onChange={(e) => setBrandCode(e.target.value)} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <Button className="self-end" disabled={pending} onClick={addBrand}>
            Add brand
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.code ?? "—"}</TableCell>
                <TableCell>{b.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-4 rounded-xl border p-4">
        <h3 className="font-medium">Categories</h3>
        <div className="flex flex-wrap gap-2">
          <div>
            <Label>Code</Label>
            <Input value={catCode} onChange={(e) => setCatCode(e.target.value)} />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
          </div>
          <Button className="self-end" disabled={pending} onClick={addCategory}>
            Add category
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
