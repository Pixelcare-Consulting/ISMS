/** What a "Check SAP now" run found. */
export interface SapCheckResult {
  applied: number;
  failed: number;
  flagged: number;
  importedOrders: number;
  soImportOff: boolean;
  skippedOrders: number;
  skippedOrderReasons: readonly string[];
  soImportError: string | null;
}

export interface SapCheckSummary {
  tone: "success" | "info" | "warning";
  title: string;
  description?: string;
}

const SO_IMPORT_OFF_NOTE =
  "Sales Orders made in SAP are not imported until a start date is set in Settings → Ordering.";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** The Sales Order half of the run, or nothing when there is nothing to say. */
function salesOrderNotes(result: SapCheckResult): string[] {
  if (result.soImportOff) return [SO_IMPORT_OFF_NOTE];
  const notes: string[] = [];
  if (result.soImportError) notes.push(`Could not read Sales Orders from SAP: ${result.soImportError}`);
  if (result.importedOrders > 0) {
    notes.push(`Imported ${plural(result.importedOrders, "Sales Order")} made in SAP. See Order History.`);
  }
  if (result.skippedOrders > 0) {
    const reasons = result.skippedOrderReasons.join("; ");
    notes.push(`${plural(result.skippedOrders, "Sales Order")} not imported${reasons ? `: ${reasons}` : ""}.`);
  }
  return notes;
}

/** Toast text for a run. Delivery documents lead; the Sales Order result is never dropped. */
export function summarizeSapCheck(result: SapCheckResult): SapCheckSummary {
  const notes = salesOrderNotes(result);
  const describe = (...parts: string[]) => parts.join(" ") || undefined;
  const notApplied = result.failed + result.flagged;

  if (notApplied > 0) {
    const others =
      result.applied > 0
        ? `${plural(result.applied, "other")} ${result.applied === 1 ? "was" : "were"} added.`
        : "";
    return {
      tone: "warning",
      title: `${plural(notApplied, "SAP document")} could not be added`,
      description: describe(others, "Open the delivery to see why.", ...notes),
    };
  }
  if (result.applied > 0) {
    return {
      tone: "success",
      title: `Added ${plural(result.applied, "SAP document")} to deliveries`,
      description: describe(...notes),
    };
  }
  if (result.importedOrders > 0) {
    const [first, ...rest] = notes.filter((note) => !note.startsWith("Could not read"));
    return { tone: "success", title: first ?? "Imported from SAP", description: describe(...rest) };
  }
  if (notes.length > 0) {
    return { tone: "warning", title: "No new SAP documents", description: describe(...notes) };
  }
  return { tone: "info", title: "No new SAP documents" };
}
