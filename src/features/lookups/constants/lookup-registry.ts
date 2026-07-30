export type LookupGroup = "Products" | "Geography" | "Sales" | "Service" | "Operations";

export type LookupParentField = "regionId" | "sizeId" | "documentTypeId" | "competitorBrandId";

export type LookupParentKey = "region" | "size" | "documentType" | "competitorBrand";

export interface LookupParentConfig {
  /** Delegate key of the parent model (brand is managed outside this slice). */
  key: LookupParentKey;
  /** FK column on the child row. */
  field: LookupParentField;
  /** Relation property included on list rows. */
  relation: "region" | "size" | "documentType" | "competitorBrand";
  label: string;
  required: boolean;
}

export interface LookupEntityConfig {
  key: LookupEntityKey;
  label: string;
  singular: string;
  /** Route slug under /settings/master-data (children share their parent's slug). */
  slug: string;
  group: LookupGroup;
  /** Audit log entityType, e.g. "SaleType". */
  auditEntity: string;
  /** Audit action prefix, e.g. "sale_type" → sale_type.created. */
  auditKey: string;
  code?: { required: boolean };
  parent?: LookupParentConfig;
  /** ActualSize-only free-text classification column. */
  classField?: boolean;
  /** PackageType units / package quantity. */
  quantityField?: boolean;
  /** Child entity rendered inline on this entity's page. */
  child?: LookupEntityKey;
}

export type LookupEntityKey =
  | "category"
  | "feature"
  | "size"
  | "actualSize"
  | "resolution"
  | "packageType"
  | "area"
  | "region"
  | "province"
  | "dealerArea"
  | "branchArea"
  | "saleType"
  | "paymentType"
  | "modeOfPayment"
  | "promoType"
  | "competitor"
  | "competitorBrand"
  | "competitorModel"
  | "dealerType"
  | "customerDeliveryMethod"
  | "problemDescription"
  | "documentType"
  | "returnType"
  | "branchStatusType";

export const LOOKUP_ENTITIES: Record<LookupEntityKey, LookupEntityConfig> = {
  category: {
    key: "category",
    label: "Categories",
    singular: "category",
    slug: "categories",
    group: "Products",
    auditEntity: "Category",
    auditKey: "category",
    code: { required: false },
  },
  feature: {
    key: "feature",
    label: "Features",
    singular: "feature",
    slug: "features",
    group: "Products",
    auditEntity: "Feature",
    auditKey: "feature",
  },
  size: {
    key: "size",
    label: "Sizes",
    singular: "size",
    slug: "sizes",
    group: "Products",
    auditEntity: "Size",
    auditKey: "size",
    child: "actualSize",
  },
  actualSize: {
    key: "actualSize",
    label: "Actual sizes",
    singular: "actual size",
    slug: "sizes",
    group: "Products",
    auditEntity: "ActualSize",
    auditKey: "actual_size",
    classField: true,
    parent: {
      key: "size",
      field: "sizeId",
      relation: "size",
      label: "Size",
      required: true,
    },
  },
  resolution: {
    key: "resolution",
    label: "Resolutions",
    singular: "resolution",
    slug: "resolutions",
    group: "Products",
    auditEntity: "Resolution",
    auditKey: "resolution",
  },
  packageType: {
    key: "packageType",
    label: "Package types",
    singular: "package type",
    slug: "package-types",
    group: "Products",
    auditEntity: "PackageType",
    auditKey: "package_type",
    quantityField: true,
  },
  area: {
    key: "area",
    label: "Areas",
    singular: "area",
    slug: "areas",
    group: "Geography",
    auditEntity: "Area",
    auditKey: "area",
    code: { required: true },
  },
  region: {
    key: "region",
    label: "Regions",
    singular: "region",
    slug: "regions",
    group: "Geography",
    auditEntity: "Region",
    auditKey: "region",
  },
  province: {
    key: "province",
    label: "Provinces",
    singular: "province",
    slug: "provinces",
    group: "Geography",
    auditEntity: "Province",
    auditKey: "province",
    parent: {
      key: "region",
      field: "regionId",
      relation: "region",
      label: "Region",
      required: false,
    },
  },
  dealerArea: {
    key: "dealerArea",
    label: "Dealer areas",
    singular: "dealer area",
    slug: "dealer-areas",
    group: "Geography",
    auditEntity: "DealerArea",
    auditKey: "dealer_area",
  },
  branchArea: {
    key: "branchArea",
    label: "Branch areas",
    singular: "branch area",
    slug: "branch-areas",
    group: "Geography",
    auditEntity: "BranchArea",
    auditKey: "branch_area",
  },
  saleType: {
    key: "saleType",
    label: "Sale types",
    singular: "sale type",
    slug: "sale-types",
    group: "Sales",
    auditEntity: "SaleType",
    auditKey: "sale_type",
  },
  paymentType: {
    key: "paymentType",
    label: "Payment types",
    singular: "payment type",
    slug: "payment-types",
    group: "Sales",
    auditEntity: "PaymentType",
    auditKey: "payment_type",
  },
  modeOfPayment: {
    key: "modeOfPayment",
    label: "Modes of payment",
    singular: "mode of payment",
    slug: "mode-of-payments",
    group: "Sales",
    auditEntity: "ModeOfPayment",
    auditKey: "mode_of_payment",
  },
  promoType: {
    key: "promoType",
    label: "Promo types",
    singular: "promo type",
    slug: "promo-types",
    group: "Sales",
    auditEntity: "PromoType",
    auditKey: "promo_type",
  },
  competitor: {
    key: "competitor",
    label: "Competitors",
    singular: "competitor",
    slug: "competitors",
    group: "Sales",
    auditEntity: "Competitor",
    auditKey: "competitor",
  },
  competitorBrand: {
    key: "competitorBrand",
    label: "Competitor brands",
    singular: "competitor brand",
    slug: "competitor-brands",
    group: "Sales",
    auditEntity: "CompetitorBrand",
    auditKey: "competitor_brand",
    child: "competitorModel",
  },
  competitorModel: {
    key: "competitorModel",
    label: "Competitor models",
    singular: "competitor model",
    slug: "competitor-brands",
    group: "Sales",
    auditEntity: "CompetitorModel",
    auditKey: "competitor_model",
    parent: {
      key: "competitorBrand",
      field: "competitorBrandId",
      relation: "competitorBrand",
      label: "Competitor brand",
      required: true,
    },
  },
  dealerType: {
    key: "dealerType",
    label: "Dealer types",
    singular: "dealer type",
    slug: "dealer-types",
    group: "Sales",
    auditEntity: "DealerType",
    auditKey: "dealer_type",
  },
  customerDeliveryMethod: {
    key: "customerDeliveryMethod",
    label: "Customer delivery methods",
    singular: "customer delivery method",
    slug: "customer-delivery-methods",
    group: "Sales",
    auditEntity: "CustomerDeliveryMethod",
    auditKey: "customer_delivery_method",
  },
  problemDescription: {
    key: "problemDescription",
    label: "Problem descriptions",
    singular: "problem description",
    slug: "problem-descriptions",
    group: "Service",
    auditEntity: "ProblemDescription",
    auditKey: "problem_description",
  },
  documentType: {
    key: "documentType",
    label: "Document types",
    singular: "document type",
    slug: "document-types",
    group: "Operations",
    auditEntity: "DocumentType",
    auditKey: "document_type",
    child: "returnType",
  },
  returnType: {
    key: "returnType",
    label: "Return types",
    singular: "return type",
    slug: "document-types",
    group: "Operations",
    auditEntity: "ReturnType",
    auditKey: "return_type",
    parent: {
      key: "documentType",
      field: "documentTypeId",
      relation: "documentType",
      label: "Document type",
      required: true,
    },
  },
  branchStatusType: {
    key: "branchStatusType",
    label: "Branch statuses",
    singular: "branch status",
    slug: "branch-statuses",
    group: "Operations",
    auditEntity: "BranchStatusType",
    auditKey: "branch_status_type",
  },
};

export function isLookupEntityKey(value: string): value is LookupEntityKey {
  return value in LOOKUP_ENTITIES;
}

export function lookupEntityRoute(entity: LookupEntityKey): string {
  return `/settings/master-data/${LOOKUP_ENTITIES[entity].slug}`;
}
