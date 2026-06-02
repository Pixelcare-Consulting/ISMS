"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteSapServiceLayerSettingsAction,
  saveSapServiceLayerSettingsAction,
  setSapServiceLayerStatusAction,
  testSapServiceLayerConnectionAction,
  updateSapServiceLayerSettingsAction,
} from "@/features/sap/actions/sap.actions";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import type { SapServiceLayerSettings } from "@/features/sap/schemas/sap-service-layer.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SapServiceLayerFormProps {
  initial: SapServiceLayerSettings[];
}

export function SapServiceLayerForm({ initial }: SapServiceLayerFormProps) {
  const testFeedItems = [
    {
      atSecond: 0,
      label: "Validating connection details",
      hint: "Checking URL, company DB, username, and secure settings before calling SAP.",
    },
    {
      atSecond: 2,
      label: "Opening secure connection to SAP host",
      hint: "Network, VPN, DNS, firewall, or SSL handshake may add delay here.",
    },
    {
      atSecond: 5,
      label: "Sending login request to Service Layer",
      hint: "SAP server load or slow authentication service can increase response time.",
    },
    {
      atSecond: 9,
      label: "Waiting for SAP session token",
      hint: "Large latency usually means SAP host performance or network route issues.",
    },
  ];

  const router = useRouter();
  const defaultConfig = initial.find((config) => config.isEnabled) ?? initial[0] ?? null;
  const [configs, setConfigs] = useState<SapServiceLayerSettings[]>(initial);

  const [baseUrl, setBaseUrl] = useState(defaultConfig?.baseUrl ?? "");
  const [companyDb, setCompanyDb] = useState(defaultConfig?.companyDb ?? "");
  const [username, setUsername] = useState(defaultConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [verifySsl, setVerifySsl] = useState(defaultConfig?.verifySsl ?? true);
  const [languageCode, setLanguageCode] = useState(defaultConfig?.languageCode ?? "23");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const selection = useTableSelection(configs.map((config) => config.id));

  async function save() {
    setIsSaving(true);
    const payload = {
      baseUrl,
      companyDb,
      username,
      password: password || undefined,
      isEnabled,
      verifySsl,
      languageCode,
    };
    const result = editingId
      ? await updateSapServiceLayerSettingsAction({ configId: editingId, ...payload })
      : await saveSapServiceLayerSettingsAction(payload);
    setIsSaving(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    const createdSettings = result.settings;
    setConfigs((current) => {
      const nextBase = createdSettings.isEnabled
        ? current.map((config) => ({ ...config, isEnabled: false }))
        : current;

      if (editingId) return nextBase.map((config) => (config.id === editingId ? createdSettings : config));
      return [createdSettings, ...nextBase];
    });

    toast.success(editingId ? "Service Layer settings updated" : "Service Layer settings saved");
    setBaseUrl("");
    setCompanyDb("");
    setUsername("");
    setPassword("");
    setIsEnabled(true);
    setVerifySsl(true);
    setLanguageCode("23");
    setEditingId(null);
    router.refresh();
  }

  function startEdit(config: SapServiceLayerSettings) {
    setEditingId(config.id);
    setBaseUrl(config.baseUrl);
    setCompanyDb(config.companyDb);
    setUsername(config.username);
    setPassword("");
    setIsEnabled(config.isEnabled);
    setVerifySsl(config.verifySsl);
    setLanguageCode(config.languageCode);
  }

  function cancelEdit() {
    setEditingId(null);
    setBaseUrl("");
    setCompanyDb("");
    setUsername("");
    setPassword("");
    setIsEnabled(true);
    setVerifySsl(true);
    setLanguageCode("23");
  }

  async function setStatus(configId: string, nextEnabled: boolean) {
    setStatusUpdatingId(configId);
    const result = await setSapServiceLayerStatusAction({
      configId,
      isEnabled: nextEnabled,
    });
    setStatusUpdatingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    setConfigs((current) =>
      current.map((config) => {
        if (config.id === configId) return { ...config, isEnabled: nextEnabled };
        return nextEnabled ? { ...config, isEnabled: false } : config;
      }),
    );

    toast.success(nextEnabled ? "Configuration activated" : "Configuration marked inactive");
    router.refresh();
  }

  async function testConnection() {
    setIsTesting(true);
    const result = await testSapServiceLayerConnectionAction({
      baseUrl,
      companyDb,
      username,
      password: password || undefined,
      isEnabled,
      verifySsl,
      languageCode,
    });
    setIsTesting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    const durationSeconds = Math.max(1, Math.round(result.durationMs / 100) / 10);
    toast.success(`SAP Service Layer connection is working (${durationSeconds}s)`);
  }

  async function deleteConfig() {
    if (!deletingId) return;
    const targetId = deletingId;
    const previous = configs;

    setConfigs((current) => current.filter((config) => config.id !== targetId));
    setDeleteDialogOpen(false);
    setDeletingId(null);
    setIsDeleting(true);

    const result = await deleteSapServiceLayerSettingsAction({ configId: targetId });
    setIsDeleting(false);
    if (result.error) {
      setConfigs(previous);
      toast.error(result.error);
      return;
    }

    if (editingId === targetId) cancelEdit();
    toast.success("Service Layer configuration deleted");
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6 p-6">
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
                <Label htmlFor="sap-sl-password">Password</Label>
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
              <p className="text-xs text-muted-foreground">
                SAP language code (default 23 = English US).
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isEnabled} onCheckedChange={(v) => setIsEnabled(v === true)} />
                Set this new configuration as active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={verifySsl} onCheckedChange={(v) => setVerifySsl(v === true)} />
                Verify SSL certificate
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {configs.length > 0 ? `${configs.length} configuration(s) saved` : "Not configured yet"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={isSaving || isTesting} onClick={testConnection}>
                {isTesting ? <LoadingIndicator label="Testing..." /> : "Test connection"}
              </Button>
              <Button disabled={isSaving || isTesting} onClick={save}>
                {isSaving ? (
                  <LoadingIndicator label={editingId ? "Updating..." : "Saving..."} />
                ) : editingId ? (
                  "Update configuration"
                ) : (
                  "Add configuration"
                )}
              </Button>
              {editingId ? (
                <Button variant="ghost" disabled={isSaving || isTesting} onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t p-6 lg:border-t-0 lg:border-l">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">SAP DB configurations</h3>
            <p className="text-sm text-muted-foreground">
              Manage multiple SAP company databases and choose which one is active.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all SAP configs"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Company DB</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    No SAP DB configuration yet.
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((config, index) => {
                  const isUpdating = statusUpdatingId === config.id;

                  return (
                    <TableRow key={config.id} data-state={selection.isRowSelected(config.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selection.isRowSelected(config.id)}
                          onCheckedChange={(checked) => selection.toggleRow(config.id, checked === true)}
                          aria-label={`Select SAP config ${config.companyDb}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{config.companyDb}</TableCell>
                      <TableCell>{config.username}</TableCell>
                      <TableCell>
                        <Badge variant={config.isEnabled ? "default" : "destructive"}>
                          {config.isEnabled ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving || isTesting || Boolean(statusUpdatingId)}
                            onClick={() => startEdit(config)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={config.isEnabled ? "outline" : "default"}
                            disabled={isSaving || isTesting || Boolean(statusUpdatingId)}
                            onClick={() => setStatus(config.id, !config.isEnabled)}
                          >
                            {isUpdating ? (
                              <LoadingIndicator label="Updating..." />
                            ) : config.isEnabled ? (
                              "Set inactive"
                            ) : (
                              "Set active"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isSaving || isTesting || Boolean(statusUpdatingId)}
                            onClick={() => {
                              setDeletingId(config.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingId(null);
        }}
        title="Delete SAP DB configuration?"
        description="This configuration will be permanently removed."
        pending={isDeleting}
        onConfirm={deleteConfig}
      />
      <LoadingModal
        open={isTesting}
        title="Testing SAP connection"
        description="Trying to sign in to SAP Service Layer with the provided credentials."
        feedItems={testFeedItems}
      />
    </div>
  );
}
