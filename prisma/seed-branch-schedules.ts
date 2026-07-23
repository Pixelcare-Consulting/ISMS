import type { PrismaClient, DeliveryFrequency } from "@prisma/client";

/**
 * Reusable delivery-frequency codes (F-codes). These are configurable in
 * Settings → Ordering policy; seeded here so branches have codes to pick from.
 */
const FREQUENCY_CODES: {
  code: string;
  frequency: DeliveryFrequency;
  description: string;
}[] = [
  { code: "F1", frequency: "monthly", description: "Once a month delivery" },
  { code: "F2", frequency: "biweekly", description: "Once every two weeks" },
  { code: "F3", frequency: "triweekly", description: "Once every three weeks" },
  { code: "F4", frequency: "weekly", description: "Once a week delivery" },
  { code: "F8", frequency: "twice_weekly", description: "Twice a week delivery" },
];

/**
 * Per-branch delivery cadence + ordering windows, transcribed from the client's
 * schedule notes. Weekdays are 0=Sunday … 6=Saturday. `fCode` references one of
 * the FREQUENCY_CODES above.
 *
 * Branches are matched by name (case-insensitive) within the tenant; any branch
 * that does not yet exist is skipped and logged. Re-running is safe (upsert).
 */
interface ScheduleSpec {
  /** Name fragment used to locate the branch (case-insensitive contains). */
  match: string;
  fCode: string;
  deliveryDays: number[];
  orderDays: number[];
  notes: string;
  spRemarks: string;
}

const SCHEDULE_SPECS: ScheduleSpec[] = [
  {
    match: "Morato",
    fCode: "F4",
    deliveryDays: [3], // Wednesday
    orderDays: [4, 5, 6, 0, 1], // Thursday → Monday
    notes: "Once a week delivery. Ordering locked Tuesday and Wednesday.",
    spRemarks: "ALL OK.",
  },
  {
    match: "Taguig",
    fCode: "F3",
    deliveryDays: [5], // Friday
    orderDays: [6, 0, 1, 2, 3], // Saturday → Wednesday
    notes:
      "Once every three weeks (3x a month; no fixed week number for Luzon). Ordering locked Thursday and Friday.",
    spRemarks: "With correction.",
  },
  {
    match: "Recto",
    fCode: "F2",
    deliveryDays: [1], // Monday
    orderDays: [2, 3, 4, 5], // Tuesday → Friday
    notes: "Once every two weeks. Ordering locked Saturday, Sunday, and Monday.",
    spRemarks: "With correction.",
  },
  {
    match: "Pasong Tamo",
    fCode: "F1",
    deliveryDays: [4], // Thursday
    orderDays: [5, 6, 0, 1, 2], // Friday → Tuesday
    notes: "Once a month delivery. Ordering locked Wednesday and Thursday.",
    spRemarks: "ALL OK.",
  },
  {
    // Corrected F8 example: Tuesday & Friday deliveries.
    match: "Branch A",
    fCode: "F8",
    deliveryDays: [2, 5], // Tuesday & Friday
    orderDays: [0, 3, 4], // Sunday, Wednesday, Thursday
    notes:
      "Twice a week delivery (Tue & Fri). Per client correction: Tuesday deliveries order Fri–Sat (lock Mon); Friday deliveries order Tue–Wed (lock Thu). Single ordering window is enforced here.",
    spRemarks:
      "No actual F8 schedule with Tuesday & Saturday exists; use Tuesday & Friday with one-day locks to avoid conflicts.",
  },
];

/**
 * Branches referenced in the client's schedule notes that have not yet been
 * onboarded with a real SAP code. sapCode values here are placeholders
 * (WTG/WPT/WBA-0xx) and must be replaced once the real codes are known.
 */
const PLACEHOLDER_BRANCHES: { sapCode: string; name: string }[] = [
  { sapCode: "WTG-005", name: "Taguig" },
  { sapCode: "WPT-006", name: "Pasong Tamo" },
  { sapCode: "WBA-007", name: "Branch A" },
];

export async function seedBranchSchedules(prisma: PrismaClient, tenantId: string) {
  // 1. Frequency codes (reusable lookup) — build a code → id map.
  const codeIdByCode = new Map<string, string>();
  for (const fc of FREQUENCY_CODES) {
    const record = await prisma.frequencyCode.upsert({
      where: { tenantId_code: { tenantId, code: fc.code } },
      create: { tenantId, code: fc.code, frequency: fc.frequency, description: fc.description },
      update: { frequency: fc.frequency, description: fc.description },
    });
    codeIdByCode.set(fc.code, record.id);
  }

  // 2. Placeholder branches for schedules not yet mapped to a real branch.
  for (const placeholder of PLACEHOLDER_BRANCHES) {
    await prisma.branch.upsert({
      where: { tenantId_sapCode: { tenantId, sapCode: placeholder.sapCode } },
      create: {
        tenantId,
        sapCode: placeholder.sapCode,
        name: placeholder.name,
        status: "active",
      },
      update: {},
    });
  }

  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, sapCode: true },
  });

  // 3. Per-branch schedules.
  let applied = 0;
  const skipped: string[] = [];

  for (const spec of SCHEDULE_SPECS) {
    const needle = spec.match.toLowerCase();
    const branch = branches.find(
      (b) =>
        b.name.toLowerCase().includes(needle) || b.sapCode.toLowerCase().includes(needle),
    );
    const frequencyCodeId = codeIdByCode.get(spec.fCode);

    if (!branch || !frequencyCodeId) {
      skipped.push(spec.match);
      continue;
    }

    await prisma.branchDeliverySchedule.upsert({
      where: { branchId: branch.id },
      create: {
        tenantId,
        branchId: branch.id,
        frequencyCodeId,
        deliveryDays: spec.deliveryDays,
        orderDays: spec.orderDays,
        notes: spec.notes,
        spRemarks: spec.spRemarks,
      },
      update: {
        frequencyCodeId,
        deliveryDays: spec.deliveryDays,
        orderDays: spec.orderDays,
        notes: spec.notes,
        spRemarks: spec.spRemarks,
      },
    });
    applied += 1;
  }

  // 4. Ensure the tenant has an ordering policy row (Sunday locked by default).
  await prisma.orderingPolicy.upsert({
    where: { tenantId },
    create: { tenantId, globalLockedWeekdays: [0] },
    update: {},
  });

  console.log(
    `Branch schedules seed: ${FREQUENCY_CODES.length} frequency codes, ${applied} schedules applied` +
      (skipped.length ? `, skipped (branch not found): ${skipped.join(", ")}` : ""),
  );
}
