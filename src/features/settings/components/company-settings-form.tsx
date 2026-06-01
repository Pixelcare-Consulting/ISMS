"use client";

import { Building2, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateCompanySettingsAction } from "@/features/settings/actions/company.actions";
import {
  ISMS_TAGLINE_SUGGESTIONS,
  type CompanySettingsInput,
} from "@/features/settings/schemas/company-settings.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { processBrandImage } from "@/utils/process-brand-image";

interface CompanySettingsFormProps {
  initialValues: CompanySettingsInput;
  slug: string;
  canEdit: boolean;
}

export function CompanySettingsForm({
  initialValues,
  slug,
  canEdit,
}: CompanySettingsFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialValues.name);
  const [tagline, setTagline] = useState(initialValues.tagline);
  const [logo, setLogo] = useState<string | null>(initialValues.logo ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [logoPending, setLogoPending] = useState(false);

  async function saveSettings(input: {
    name: string;
    tagline: string;
    logo?: string | null;
  }) {
    const result = await updateCompanySettingsAction(input);

    if (result.error) {
      throw new Error(result.error);
    }

    router.refresh();
    return result;
  }

  async function onLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;

    setLogoPending(true);

    try {
      const processedLogo = await processBrandImage(file);
      setLogo(processedLogo);
      await saveSettings({ name, tagline, logo: processedLogo });
      toast.success("Company logo updated", {
        description: "Your sidebar branding has been refreshed.",
      });
    } catch (uploadError) {
      toast.error("Could not update logo", {
        description:
          uploadError instanceof Error
            ? uploadError.message
            : "Failed to process image.",
      });
    } finally {
      setLogoPending(false);
    }
  }

  async function onRemoveLogo() {
    if (!canEdit) return;

    setLogoPending(true);

    try {
      setLogo(null);
      await saveSettings({ name, tagline, logo: null });
      toast.success("Company logo removed");
    } catch (removeError) {
      setLogo(initialValues.logo ?? null);
      toast.error("Could not remove logo", {
        description:
          removeError instanceof Error
            ? removeError.message
            : "Failed to update company settings.",
      });
    } finally {
      setLogoPending(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await saveSettings({ name, tagline, logo });
        toast.success("Company settings saved", {
          description: "Sidebar branding updated for your organization.",
        });
      } catch (submitError) {
        const message =
          submitError instanceof Error
            ? submitError.message
            : "Failed to update company settings";
        setError(message);
        toast.error("Could not save settings", { description: message });
      }
    });
  }

  function applySuggestion(suggestion: string) {
    if (!canEdit) return;
    setTagline(suggestion);
  }

  const isBusy = pending || logoPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-3">
        <Label>Company logo</Label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
            {logo ? (
              <Image
                src={logo}
                alt={`${name} logo`}
                width={64}
                height={64}
                className="size-full object-contain"
                unoptimized
              />
            ) : (
              <Building2 className="size-7 text-muted-foreground" />
            )}
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                onChange={onLogoSelect}
                disabled={isBusy}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Upload logo"
                )}
              </Button>
              {logo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={onRemoveLogo}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Shown in the sidebar for your organization only. JPEG, PNG, or WebP up
          to 512 KB.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company-name">Company name</Label>
          <Input
            id="company-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canEdit || isBusy}
            placeholder="FINDEN ISMS"
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            Shown in the sidebar header for your team.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company-slug">Organization slug</Label>
          <Input id="company-slug" value={slug} disabled readOnly />
          <p className="text-xs text-muted-foreground">
            Used when signing in. Cannot be changed here.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company-tagline">ISMS tagline</Label>
        <Input
          id="company-tagline"
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          disabled={!canEdit || isBusy}
          placeholder="Secure your information assets"
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">
          Displayed under your company name in the sidebar.
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {ISMS_TAGLINE_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canEdit ? (
        <Button type="submit" disabled={isBusy}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact a tenant administrator to update company branding.
        </p>
      )}
    </form>
  );
}
