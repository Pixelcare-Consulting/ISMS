import { deliveryPostingService } from "@/features/logistics/services/delivery-posting.service";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import { transferPostingService } from "@/features/logistics/services/transfer-posting.service";
import { opsRepository } from "@/features/ops/repositories/ops.repository";

export const opsService = {
  listDeliveries(tenantId: string, branchIds?: string[]) {
    return opsRepository.listDeliveries(tenantId, branchIds);
  },

  listTransfers(tenantId: string) {
    return opsRepository.listTransfers(tenantId);
  },

  listPullouts(tenantId: string, branchIds?: string[]) {
    return opsRepository.listPullouts(tenantId, branchIds);
  },

  listDeliveryReceiptLines(actor: PostingActor, deliveryId: string) {
    return deliveryPostingService.listReceiptLines(actor, deliveryId);
  },

  async acceptDelivery(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    deliveryId: string;
    serialNumberIds?: string[];
  }) {
    return deliveryPostingService.accept({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      permissions: input.permissions,
      deliveryId: input.deliveryId,
      serialNumberIds: input.serialNumberIds,
    });
  },

  async rejectDelivery(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    deliveryId: string;
  }) {
    return deliveryPostingService.reject({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      permissions: input.permissions,
      deliveryId: input.deliveryId,
    });
  },

  createTransfer(
    actor: PostingActor,
    input: {
      fromBranchId: string;
      toBranchId: string;
      modelId: string;
      quantity: number;
      serialNumberIds: string[];
      notes?: string;
    },
  ) {
    return transferPostingService.create(actor, input);
  },

  createPullout(
    actor: PostingActor,
    input: {
      branchId: string;
      warehouseId: string;
      reasonStatusCodeId: string;
      serialNumberIds: string[];
      notes?: string;
    },
  ) {
    return pulloutPostingService.create(actor, input);
  },

  countPendingDeliveries(tenantId: string) {
    return opsRepository.countPendingDeliveries(tenantId);
  },
};
