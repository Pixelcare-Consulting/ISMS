import {
  proofErrorResponse,
  proofIndexFromRequest,
  serveSaleProofFile,
  type ProofBackLink,
} from "@/features/sales/server/sale-proof-response";
import { buildSalesPageHref } from "@/features/sales/utils/sales-page-href";
import { SC_SALES_ACCESS } from "@/features/service-center-ops/constants/sc-permissions";
import { scSalesRepository } from "@/features/service-center-ops/repositories/sc-sales.repository";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";

const SC_SALES_BACK_LINK: ProofBackLink = {
  href: buildSalesPageHref({ tab: "service-center" }),
  label: "Back to service center sales",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return proofErrorResponse(
      request,
      401,
      "Sign in required",
      "You need to be signed in to review this proof attachment.",
      SC_SALES_BACK_LINK,
    );
  }

  const canAccess = SC_SALES_ACCESS.some((slug) =>
    hasPermission(session.user.permissions, slug),
  );
  if (!canAccess) {
    return proofErrorResponse(
      request,
      403,
      "Access denied",
      "You do not have permission to review service center sales proof attachments.",
      SC_SALES_BACK_LINK,
    );
  }

  const { id: saleId } = await context.params;
  const index = proofIndexFromRequest(request);
  if (index === null) {
    return proofErrorResponse(
      request,
      400,
      "Invalid proof link",
      "This proof link is incomplete. Open the sale again and choose Review proof.",
      SC_SALES_BACK_LINK,
    );
  }

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const sale = await scSalesRepository.findSaleProof(session.user.tenantId, scopedIds, saleId);
  if (!sale) {
    return proofErrorResponse(
      request,
      404,
      "Sale not found",
      "This sale could not be found, so the proof cannot be opened.",
      SC_SALES_BACK_LINK,
    );
  }

  return serveSaleProofFile(request, { proof: sale.proof, index, back: SC_SALES_BACK_LINK });
}
