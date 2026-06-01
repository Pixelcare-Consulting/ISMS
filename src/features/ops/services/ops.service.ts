import { auditService } from "@/features/audit/services/audit.service";
import { opsRepository } from "@/features/ops/repositories/ops.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";

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
    const delivery = await opsRepository.acceptDelivery(
      input.tenantId,
      input.deliveryId,
    );

    const [ditCodeId, stkCodeId] = await Promise.all([
      reasonStatusService.requireCodeId(input.tenantId, "inventory_system", "DIT"),
      reasonStatusService.requireCodeId(input.tenantId, "inventory_system", "STK"),
    ]);

    await opsRepository.promoteInTransitToStock(
      input.tenantId,
      delivery.branchId,
      ditCodeId,
      stkCodeId,
      input.actorUserId,
    );

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "delivery.accepted",
      entityType: "BranchDelivery",
      entityId: delivery.id,
      metadata: {
        deliveryNo: delivery.deliveryNo,
        branchName: delivery.branch.name,
        ...(delivery.order ? { orderNumber: delivery.order.orderNumber } : {}),
      },
    });

    return delivery;
  },

  async createTransfer(input: {
    tenantId: string;
    actorUserId: string;
    fromBranchId: string;
    toBranchId: string;
    notes?: string;
  }) {
    if (input.fromBranchId === input.toBranchId) {
      throw new Error("Source and destination must differ");
    }
    const transfer = await opsRepository.createTransfer(input.tenantId, input);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "transfer.created",
      entityType: "BranchTransfer",
      entityId: transfer.id,
      metadata: {
        transferNo: transfer.transferNo,
        from: transfer.fromBranch.name,
        to: transfer.toBranch.name,
      },
    });
    return transfer;
  },

  async createPullout(input: {
    tenantId: string;
    actorUserId: string;
    branchId: string;
    warehouseId: string;
    notes?: string;
  }) {
    const pullout = await opsRepository.createPullout(input.tenantId, {
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      notes: input.notes,
    });
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "pullout.created",
      entityType: "BranchPullout",
      entityId: pullout.id,
      metadata: {
        pulloutNo: pullout.pulloutNo,
        branchName: pullout.branch.name,
      },
    });
    return pullout;
  },

  countPendingDeliveries(tenantId: string) {
    return opsRepository.countPendingDeliveries(tenantId);
  },
};
