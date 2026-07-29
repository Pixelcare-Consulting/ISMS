/**
 * Central definitions for route-based section tabs.
 * Update labels and paths here — layouts import these arrays.
 *
 * Keep this module free of non-serializable values (e.g. icon components) so it
 * stays safe to import from both Server and Client Components. Presentation
 * concerns like group icons live with the component that renders them.
 */

export interface SectionTabDefinition {
  href: string;
  label: string;
  /** Only `pathname === href` is active (use for section index routes). */
  exact?: boolean;
  /** Short summary shown on hub/landing cards. */
  description?: string;
  /** Compact awareness pill on hub cards / nav (same as sidebar). */
  badge?: "new";
}

export interface SectionTabGroupDefinition {
  label: string;
  items: SectionTabDefinition[];
}

/** SAP integration sub-routes (not listed separately in header nav). */
export const SAP_INTEGRATION_TABS: SectionTabDefinition[] = [
  { href: "/settings/sap-integration", label: "Integration queue", exact: true },
  { href: "/settings/sap-integration/service-layer", label: "Service Layer" },
];

/** Master data landing route — the card hub linking to every lookup table. */
export const MASTER_DATA_ROOT = "/settings/master-data";

/** Master data sub-routes, grouped. Rendered as a card hub at MASTER_DATA_ROOT. */
export const MASTER_DATA_TAB_GROUPS: SectionTabGroupDefinition[] = [
  {
    label: "Products",
    items: [
      {
        href: "/settings/master-data/brands",
        label: "Brands",
        description: "Reference data for product models and planograms.",
      },
      {
        href: "/settings/master-data/models",
        label: "Models",
        description: "SKUs for branch planograms and orders (active / hold / retired).",
      },
      {
        href: "/settings/master-data/price-lists",
        label: "Price lists",
        description: "Period-based SRP rows by model and package type.",
      },
      {
        href: "/settings/master-data/categories",
        label: "Categories",
        description: "Product categories linked to models (not brands).",
      },
      {
        href: "/settings/master-data/package-types",
        label: "Package types",
        description: "Package type lookup for orders, sales, and price lists.",
      },
      {
        href: "/settings/master-data/features",
        label: "Features",
        description: "Product feature lookup for model specifications.",
      },
      {
        href: "/settings/master-data/sizes",
        label: "Sizes",
        description: "Product sizes with their actual size breakdowns.",
      },
      {
        href: "/settings/master-data/resolutions",
        label: "Resolutions",
        description: "Display resolution lookup for product models.",
      },
    ],
  },
  {
    label: "Geography",
    items: [
      {
        href: "/settings/master-data/areas",
        label: "Areas",
        description: "Coverage areas (code + name) assigned to branches.",
      },
      {
        href: "/settings/master-data/regions",
        label: "Regions",
        description: "Geographic regions grouping provinces.",
      },
      {
        href: "/settings/master-data/provinces",
        label: "Provinces",
        description: "Provinces, optionally assigned to a region.",
      },
      {
        href: "/settings/master-data/dealer-areas",
        label: "Dealer areas",
        description: "Dealer area lookup for dealer coverage.",
      },
      {
        href: "/settings/master-data/branch-areas",
        label: "Branch areas",
        description: "Branch area lookup for branch grouping.",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        href: "/settings/master-data/sale-types",
        label: "Sale types",
        description: "Sale type lookup for sales transactions.",
      },
      {
        href: "/settings/master-data/payment-types",
        label: "Payment types",
        description: "Payment type lookup for sales transactions.",
      },
      {
        href: "/settings/master-data/mode-of-payments",
        label: "Modes of payment",
        description: "Mode of payment lookup for dealers (outright / consignment).",
      },
      {
        href: "/settings/master-data/promo-types",
        label: "Promo types",
        description: "Promo type lookup for sales promotions.",
      },
      {
        href: "/settings/master-data/competitors",
        label: "Competitors",
        description: "Competitor name lookup for market observations.",
        badge: "new",
      },
      {
        href: "/settings/master-data/dealer-types",
        label: "Dealer types",
        description: "Dealer type lookup for dealer classification.",
      },
      {
        href: "/settings/master-data/customer-delivery-methods",
        label: "Customer delivery methods",
        description: "Delivery method lookup for customer orders.",
      },
    ],
  },
  {
    label: "Service",
    items: [
      {
        href: "/settings/master-data/problem-descriptions",
        label: "Problem descriptions",
        description: "Problem description lookup for service requests.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/settings/master-data/document-types",
        label: "Document types",
        description: "Document types with their return type breakdowns.",
      },
      {
        href: "/settings/master-data/branch-statuses",
        label: "Branch statuses",
        description: "Branch status lookup for branch operations.",
      },
    ],
  },
];
