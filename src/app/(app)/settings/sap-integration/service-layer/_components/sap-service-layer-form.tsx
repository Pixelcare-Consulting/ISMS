"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveSapServiceLayerSettingsAction } from "@/features/sap/actions/sap.actions";
import type { SapServiceLayerSettings } from "@/features/sap/schemas/sap-service-layer.schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SapServiceLayerFormProps {
  initial: SapServiceLayerSettings | null;
}

export function SapServiceLayerForm({ initial }: SapServiceLayerFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [companyDb, setCompanyDb] = useState(initial?.companyDb ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [isEnabled, setIsEnabled] = useState(initial?.isEnabled ?? false);
  const [verifySsl, setVerifySsl] = useState(initial?.verifySsl ?? true);
  const [languageCode, setLanguageCode] = useState(initial?.languageCode ?? "23");

  function save() {
    startTransition(async () => {
      const result = await saveSapServiceLayerSettingsAction({
        baseUrl,
        companyDb,
        username,
        password: password || undefined,
        isEnabled,
        verifySsl,
        languageCode,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Service Layer settings saved");
      setPassword("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">SAP Business One Service Layer</h2>
        <p className="text-sm text-muted-foreground">
          BaseURL, company database, username, and password are encrypted. 
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sap-sl-url">Service Layer URL</Label>
          <Input
            id="sap-sl-url"
            placeholder="https://serverhost:50000/b1s/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sap-sl-company">Company database</Label>
          <Input
            id="sap-sl-company"
            placeholder="CompanyDB"
            value={companyDb}
            onChange={(e) => setCompanyDb(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sap-sl-user">Username</Label>
            <Input
              id="sap-sl-user"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sap-sl-password">
              Password{initial?.hasPassword ? " (leave blank to keep current)" : ""}
            </Label>
            <Input
              id="sap-sl-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sap-sl-lang">Language code</Label>
          <Input
            id="sap-sl-lang"
            className="w-24"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">SAP language code (default 23 = English US).</p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isEnabled} onCheckedChange={(v) => setIsEnabled(v === true)} />
            Enable Service Layer integration for this tenant
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={verifySsl} onCheckedChange={(v) => setVerifySsl(v === true)} />
            Verify SSL certificate
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        {initial?.updatedAt ? (
          <p className="text-xs text-muted-foreground">
            Last saved {new Date(initial.updatedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Not configured yet</p>
        )}
        <Button disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
