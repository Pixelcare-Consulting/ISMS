"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProviderCustomerBrandingAction } from "@/features/provider/actions/provider.actions";
import { resolveTenantTagline } from "@/features/tenants/types/tenant-branding";

interface EditOrganizationFormProps {
  tenantId: string;
  initialName: string;
  initialTagline: string | null;
  initialLogo: string | null;
  slug: string;
  disabled?: boolean;
}

export function EditOrganizationForm({
  tenantId,
  initialName,
  initialTagline,
  initialLogo,
  slug,
  disabled = false,
}: EditOrganizationFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [tagline, setTagline] = useState(
    initialTagline?.trim() || resolveTenantTagline(null),
  );
  const [logo, setLogo] = useState(initialLogo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    setError(null);
    startTransition(async () => {
      const result = await updateProviderCustomerBrandingAction({
        tenantId,
        name,
        tagline,
        logo: logo.trim() === "" ? null : logo.trim(),
      });

      if (!result.success) {
        setError(result.error);
        toast.error("Could not update organization", {
          description: result.error,
        });
        return;
      }

      toast.success("Organization updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
            disabled={disabled || pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-slug">Slug</Label>
          <Input id="org-slug" value={slug} disabled readOnly />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-tagline">Tagline</Label>
        <Input
          id="org-tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          maxLength={120}
          disabled={disabled || pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-logo">Logo URL</Label>
        <Input
          id="org-logo"
          type="text"
          value={logo}
          onChange={(event) => setLogo(event.target.value)}
          placeholder="https://… (optional)"
          disabled={disabled || pending}
        />
        <p className="text-xs text-muted-foreground">
          Optional public image URL shown in the customer app sidebar.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Saving…" : "Save organization"}
        </Button>
      </div>
    </form>
  );
}
