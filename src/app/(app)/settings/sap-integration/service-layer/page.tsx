import { getSapServiceLayerSettingsAction } from "@/features/sap/actions/sap.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SapServiceLayerForm } from "@/app/(app)/settings/sap-integration/service-layer/_components/sap-service-layer-form";

export default async function SapServiceLayerPage() {
  await requirePermission("logistics.manage");
  const settings = await getSapServiceLayerSettingsAction();

  return <SapServiceLayerForm initial={settings} />;
}
