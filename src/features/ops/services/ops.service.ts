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

  async acceptDelivery(input: {
    tenantId: string;
    actorUserId: string;
    deliveryId: string;
  }) {
    return deliveryPostingService.accept({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      deliveryId: input.deliveryId,
    });
  },

  async rejectDelivery(input: {
    tenantId: string;
    actorUserId: string;
    deliveryId: string;
  }) {
    return deliveryPostingService.reject({
      tenantId: input.tenantId,
      userId: input.actorUserId,
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
      transferNo?: string;
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
