import { SALES_ACCESS_PERMISSIONS } from "@/features/sales/constants/sales-permissions";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import {
  proofErrorResponse,
  proofIndexFromRequest,
  serveSaleProofFile,
} from "@/features/sales/server/sale-proof-response";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";

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
    );
  }

  const canAccess = SALES_ACCESS_PERMISSIONS.some((slug) =>
    hasPermission(session.user.permissions, slug),
  );
  if (!canAccess) {
    return proofErrorResponse(
      request,
      403,
      "Access denied",
      "You do not have permission to review sales proof attachments.",
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
    );
  }

  const sale = await salesRepository.findSaleDetailsForTenant(
    session.user.tenantId,
    saleId,
  );
  if (!sale) {
    return proofErrorResponse(
      request,
      404,
      "Sale not found",
      "This sale could not be found, so the proof cannot be opened.",
    );
  }

  return serveSaleProofFile(request, { proof: sale.proof, index });
}
