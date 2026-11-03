import { auditService } from "@/features/audit/services/audit.service";
import { SC_ORDERING_NOT_SET_UP } from "@/features/service-center-ordering/constants";
import {
  scOrderingSettingsRepository,
  type ScOrderingDefaults,
} from "@/features/service-center-ordering/repositories/sc-ordering-settings.repository";
import { findSapCustomer } from "@/features/service-center-ordering/services/sc-ordering-sap";

const EMPTY_DEFAULTS: ScOrderingDefaults = {
  warehouseCode: null,
  branchCode: null,
  departmentCode: null,
  cogsBranchCode: null,
};

/** What a service-center SO posts with, copied onto the order when it is created. */
export interface ScOrderPostingSnapshot {
  sapCardCode: string;
  sapWarehouseCode: string;
  sapBranchCode: string | null;
  sapDepartmentCode: string | null;
  sapCogsBranchCode: string | null;
}

export const scOrderingSettingsService = {
  async get(tenantId: string) {
    const [defaults, customers] = await Promise.all([
      scOrderingSettingsRepository.findDefaults(tenantId),
      scOrderingSettingsRepository.listCustomers(tenantId),
    ]);
    return { defaults: defaults ?? EMPTY_DEFAULTS, customers };
  },

  async updateDefaults(tenantId: string, actorUserId: string, defaults: ScOrderingDefaults) {
    const saved = await scOrderingSettingsRepository.upsertDefaults(tenantId, defaults);
    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "sc_ordering.defaults_updated",
      entityType: "ServiceCenterOrderingSettings",
      entityId: tenantId,
      metadata: saved,
    });
    return saved;
  },

  /** Only a code SAP knows as a customer is accepted; its name is stored with it. */
  async addCustomer(tenantId: string, actorUserId: string, cardCode: string) {
    if (await scOrderingSettingsRepository.findCustomer(tenantId, cardCode)) {
      throw new Error(`${cardCode} is already in the list.`);
    }
    const customer = await findSapCustomer(tenantId, cardCode);
    if (!customer) throw new Error(`SAP has no customer with code ${cardCode}.`);
    const created = await scOrderingSettingsRepository.addCustomer(tenantId, customer);
    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "sc_ordering.customer_added",
      entityType: "ServiceCenterOrderCustomer",
      entityId: created.id,
      metadata: { cardCode: created.cardCode },
    });
    return created;
  },

  async setPrimaryCustomer(tenantId: string, actorUserId: string, id: string) {
    const target = await scOrderingSettingsRepository.setPrimary(tenantId, id);
    if (!target) throw new Error("Customer not found");
    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "sc_ordering.customer_primary",
      entityType: "ServiceCenterOrderCustomer",
      entityId: id,
      metadata: { cardCode: target.cardCode },
    });
  },

  async removeCustomer(tenantId: string, actorUserId: string, id: string) {
    const target = await scOrderingSettingsRepository.removeCustomer(tenantId, id);
    if (!target) throw new Error("Customer not found");
    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "sc_ordering.customer_removed",
      entityType: "ServiceCenterOrderCustomer",
      entityId: id,
      metadata: { cardCode: target.cardCode },
    });
  },

  /**
   * The values a new order posts with. `cardCode` must be a listed customer; null picks
   * the primary. Throws with the setup message when no customer or warehouse is set.
   */
  async resolvePostingSnapshot(
    tenantId: string,
    cardCode: string | null,
  ): Promise<ScOrderPostingSnapshot> {
    const { defaults, customers } = await this.get(tenantId);
    const customer = cardCode
      ? customers.find((row) => row.cardCode === cardCode)
      : customers.find((row) => row.isPrimary);
    if (cardCode && !customer) {
      throw new Error(`${cardCode} is not a service center ordering customer.`);
    }
    if (!customer || !defaults.warehouseCode) throw new Error(SC_ORDERING_NOT_SET_UP);
    return {
      sapCardCode: customer.cardCode,
      sapWarehouseCode: defaults.warehouseCode,
      sapBranchCode: defaults.branchCode,
      sapDepartmentCode: defaults.departmentCode,
      sapCogsBranchCode: defaults.cogsBranchCode,
    };
  },
};
