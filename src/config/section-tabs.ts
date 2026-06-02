/**
 * Central definitions for route-based section tabs.
 * Update labels and paths here — layouts import these arrays.
 */

export interface SectionTabDefinition {
  href: string;
  label: string;
  /** Only `pathname === href` is active (use for section index routes). */
  exact?: boolean;
}

/** SAP integration sub-routes (not listed separately in header nav). */
export const SAP_INTEGRATION_TABS: SectionTabDefinition[] = [
  { href: "/settings/sap-integration", label: "Integration queue", exact: true },
  { href: "/settings/sap-integration/service-layer", label: "Service Layer" },
];

/** Master data sub-routes (header nav links to brands only). */
export const MASTER_DATA_TABS: SectionTabDefinition[] = [
  { href: "/settings/master-data/brands", label: "Brands" },
  { href: "/settings/master-data/models", label: "Models" },
];
