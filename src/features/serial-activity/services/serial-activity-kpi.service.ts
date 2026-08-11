import { serialActivityRepository } from "@/features/serial-activity/repositories/serial-activity.repository";
import type { KpiStatusCount } from "@/lib/kpi-cards";

export interface SerialActivityKpis {
  totalEvents: number;
  statuses: KpiStatusCount[];
}

export const serialActivityKpiService = {
  getKpis(tenantId: string): Promise<SerialActivityKpis> {
    return serialActivityRepository.getKpis(tenantId);
  },
};
