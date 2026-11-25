"use client";

import type { ReactNode } from "react";

import {
  PulloutSourceProvider,
  type PulloutSource,
} from "@/app/(app)/logistics/_components/pullout-source";
import {
  approveScPulloutAction,
  approveScPulloutLineAction,
  cancelScPulloutAction,
  checkScPulloutSapAction,
  createScPulloutAction,
  deleteScPulloutLineAction,
  listScCentersForPulloutsAction,
  listScPulloutChecklistOptionsAction,
  listScPulloutSerialsAction,
  rejectScPulloutAction,
  releaseScPulloutAction,
  updateScPulloutListAction,
  uploadScPulloutAttachmentAction,
} from "@/features/service-center-ops/actions/sc-pullouts.actions";

const SC_PULLOUTS_HREF = "/service-centers/pullouts";

/** Service center pull-outs: units leave a service center. After Send, Check SAP follows them. */
const SC_PULLOUT_SOURCE: PulloutSource = {
  listHref: SC_PULLOUTS_HREF,
  detailHref: (pulloutId) => `${SC_PULLOUTS_HREF}/${pulloutId}`,
  attachmentHref: (attachmentId) =>
    `/api/service-centers/pullout-attachments/${encodeURIComponent(attachmentId)}`,
  // SC deliveries have no detail page; the list shows the DR delivery.
  deliveryHref: () => "/service-centers/deliveries",
  copy: {
    placeLabel: "Service center",
    placeColumn: "Service center",
    placeSortKey: "serviceCenter",
    placePlaceholder: "Select service center…",
    placeLoading: "Loading service centers…",
    placeSearchPlaceholder: "Search service centers…",
    choosePlaceFirst: "Select a service center to see its units.",
    noFreeSerials: "No serials are free at this service center.",
    noOtherFreeSerials: "No other free serials at this service center.",
    sentStage: "These units left the service center. The pull-out ends here.",
    sentNote: (detail) =>
      `These units left ${detail.place.name} and no longer count in its inventory. In SAP, put ${detail.pulloutNo} in the "Pull Out Number Generated in ISMS" row field of the IT or Return, then use Check SAP: the units it lists become Pulled out. A DR copied from that Return back to ${detail.place.name} is picked up the same way.`,
    rejectUnitDescription:
      "The unit comes off this pull-out and goes back to its service center status.",
    printPlaceCopy: "SERVICE CENTER",
  },
  actions: {
    listPlaces: () => listScCentersForPulloutsAction(),
    listSerials: (placeId) => listScPulloutSerialsAction(placeId),
    listChecklistOptions: () => listScPulloutChecklistOptionsAction(),
    create: ({ placeId, ...rest }) => createScPulloutAction({ ...rest, serviceCenterId: placeId }),
    uploadAttachment: (formData) => uploadScPulloutAttachmentAction(formData),
    approveLine: (pulloutId, serialNumberId) => approveScPulloutLineAction(pulloutId, serialNumberId),
    deleteLine: (pulloutId, serialNumberId) => deleteScPulloutLineAction(pulloutId, serialNumberId),
    approve: (pulloutId) => approveScPulloutAction(pulloutId),
    reject: (pulloutId) => rejectScPulloutAction(pulloutId),
    updateList: (pulloutId, input) => updateScPulloutListAction(pulloutId, input),
    release: (pulloutId) => releaseScPulloutAction(pulloutId),
    checkSap: (pulloutId) => checkScPulloutSapAction(pulloutId),
    cancel: (pulloutId) => cancelScPulloutAction(pulloutId),
  },
};

/** Wraps the shared pull-out list, form, and detail page so they work on SC pull-outs. */
export function ScPulloutSourceProvider({ children }: { children: ReactNode }) {
  return <PulloutSourceProvider source={SC_PULLOUT_SOURCE}>{children}</PulloutSourceProvider>;
}
