"use client";

import { createContext, useContext, type ReactNode } from "react";

import { LOGISTICS_PICKUPS_PATH } from "@/app/(app)/logistics/_components/logistics-paths";
import {
  approvePulloutLineAction,
  approvePulloutTlAction,
  cancelPulloutAction,
  checkPulloutSapAction,
  createPulloutAction,
  deletePulloutLineAction,
  listBranchesForLogisticsAction,
  listPulloutChecklistOptionsAction,
  listPulloutSerialsAction,
  rejectPulloutAction,
  releasePulloutAction,
  updatePulloutListAction,
  uploadPulloutAttachmentAction,
  type PulloutChecklistOptions,
} from "@/features/logistics/actions/logistics.actions";
import type {
  PulloutCreateLine,
  PulloutDetail,
  PulloutSerialOption,
} from "@/features/logistics/services/pullout-posting.service";

/**
 * Where a pull-out's units leave from. Branch pull-outs and service center pull-outs use the
 * same list, request form, and detail page; a source supplies their server actions, links,
 * and the words for the place.
 */

type ActionResult = { success: true } | { error: string };

export interface PulloutPlaceOption {
  id: string;
  name: string;
}

export interface PulloutSource {
  listHref: string;
  detailHref: (pulloutId: string) => string;
  attachmentHref: (attachmentId: string) => string;
  /** Where a redelivery made by Check SAP opens. */
  deliveryHref: (deliveryId: string) => string;
  copy: {
    /** Request form and detail readout label. */
    placeLabel: string;
    /** List column header. */
    placeColumn: string;
    /** List sort key for the place column, as the list action parses it. */
    placeSortKey: string;
    placePlaceholder: string;
    placeLoading: string;
    placeSearchPlaceholder: string;
    choosePlaceFirst: string;
    noFreeSerials: string;
    noOtherFreeSerials: string;
    /** Detail stage text once the pull-out is sent. */
    sentStage: string;
    /** Logistics note once the pull-out is sent. */
    sentNote: (detail: PulloutDetail) => string;
    rejectUnitDescription: string;
    /** First page of the printed slip: "<this> COPY". */
    printPlaceCopy: string;
  };
  actions: {
    listPlaces: () => Promise<PulloutPlaceOption[]>;
    listSerials: (
      placeId: string,
    ) => Promise<{ success: true; serials: PulloutSerialOption[] } | { error: string }>;
    listChecklistOptions: () => Promise<PulloutChecklistOptions & { error?: string }>;
    create: (input: {
      placeId: string;
      lines: PulloutCreateLine[];
    }) => Promise<{ error?: string; id?: string; pulloutNo?: string }>;
    uploadAttachment: (formData: FormData) => Promise<ActionResult>;
    approveLine: (pulloutId: string, serialNumberId: string) => Promise<ActionResult>;
    deleteLine: (pulloutId: string, serialNumberId: string) => Promise<ActionResult>;
    approve: (pulloutId: string) => Promise<ActionResult>;
    reject: (pulloutId: string) => Promise<ActionResult>;
    updateList: (pulloutId: string, input: unknown) => Promise<ActionResult>;
    release: (pulloutId: string) => Promise<ActionResult>;
    /** Null where the pull-out ends at Send with no SAP follow-up. */
    checkSap: ((pulloutId: string) => ReturnType<typeof checkPulloutSapAction>) | null;
    /** After Team Lead approval. When sent: closes linked Returns and cancels linked ITs in SAP. */
    cancel: (pulloutId: string) => ReturnType<typeof cancelPulloutAction>;
  };
}

export const BRANCH_PULLOUT_SOURCE: PulloutSource = {
  listHref: LOGISTICS_PICKUPS_PATH,
  detailHref: (pulloutId) => `${LOGISTICS_PICKUPS_PATH}/${pulloutId}`,
  attachmentHref: (attachmentId) =>
    `/api/logistics/pullout-attachments/${encodeURIComponent(attachmentId)}`,
  deliveryHref: (deliveryId) => `/logistics/deliveries/${deliveryId}`,
  copy: {
    placeLabel: "Branch Name",
    placeColumn: "Branch",
    placeSortKey: "branch",
    placePlaceholder: "Select branch…",
    placeLoading: "Loading branches…",
    placeSearchPlaceholder: "Search branches…",
    choosePlaceFirst: "Select a branch to see its units.",
    noFreeSerials: "No serials are free at this branch.",
    noOtherFreeSerials: "No other free serials at this branch.",
    sentStage: "These units left the branch. The pull-out ends here.",
    sentNote: (detail) =>
      `These units left ${detail.place.name} and no longer count in its branch inventory. In SAP, put ${detail.pulloutNo} in the "Pull Out Number Generated in ISMS" row field of the IT or Return, then use Check SAP: the units it lists become Pulled out. A DR copied from that Return later is picked up the same way.`,
    rejectUnitDescription: "The unit comes off this pull-out and goes back to its branch status.",
    printPlaceCopy: "BRANCH",
  },
  actions: {
    listPlaces: () => listBranchesForLogisticsAction(),
    listSerials: (placeId) => listPulloutSerialsAction(placeId),
    listChecklistOptions: () => listPulloutChecklistOptionsAction(),
    create: ({ placeId, ...rest }) => createPulloutAction({ ...rest, branchId: placeId }),
    uploadAttachment: (formData) => uploadPulloutAttachmentAction(formData),
    approveLine: (pulloutId, serialNumberId) => approvePulloutLineAction(pulloutId, serialNumberId),
    deleteLine: (pulloutId, serialNumberId) => deletePulloutLineAction(pulloutId, serialNumberId),
    approve: (pulloutId) => approvePulloutTlAction(pulloutId),
    reject: (pulloutId) => rejectPulloutAction(pulloutId),
    updateList: (pulloutId, input) => updatePulloutListAction(pulloutId, input),
    release: (pulloutId) => releasePulloutAction(pulloutId),
    checkSap: checkPulloutSapAction,
    cancel: cancelPulloutAction,
  },
};

const PulloutSourceContext = createContext<PulloutSource>(BRANCH_PULLOUT_SOURCE);

export function PulloutSourceProvider({
  source,
  children,
}: {
  source: PulloutSource;
  children: ReactNode;
}) {
  return <PulloutSourceContext.Provider value={source}>{children}</PulloutSourceContext.Provider>;
}

/** The pull-out source for the surrounding page. Branch pull-outs when no provider is set. */
export function usePulloutSource(): PulloutSource {
  return useContext(PulloutSourceContext);
}
