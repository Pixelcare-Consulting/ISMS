import { getPrintLetterheadAction } from "@/features/settings/actions/company.actions";
import type { PrintLetterhead } from "@/utils/print-document";

/** A slip still prints, without the header, when the header cannot be loaded. */
export async function loadPrintLetterhead(): Promise<PrintLetterhead | null> {
  try {
    return await getPrintLetterheadAction();
  } catch (error) {
    console.error("Could not load the print letterhead", error);
    return null;
  }
}
