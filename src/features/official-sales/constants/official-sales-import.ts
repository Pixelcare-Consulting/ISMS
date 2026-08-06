/**
 * Transaction-number prefix stamped on every sale the Official Sales importer
 * creates. There is no source column on BranchSalesTransaction, so this prefix
 * is what tells imported sales apart from branch-encoded ones.
 */
export const OFFICIAL_SALES_TRANSACTION_PREFIX = "OFS-";
