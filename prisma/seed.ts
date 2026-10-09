import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { seedBranchSchedules } from "./seed-branch-schedules";
import { seedBrsDemoData } from "./seed-brs";
import { seedCore } from "./seed-core";
import { resolveSeedProfile, type SeedProfile } from "./seed-data";
import { seedDemoNotifications } from "./seed-notifications";
import { seedRegionsAndProvincesForAllTenants } from "./seed-ph-geo";
import { seedPsgBranchesForAllTenants } from "./seed-psg-branches";
import { seedPsgModelAndOutgoing } from "./seed-psg";
import { seedReasonStatusesForTenant } from "./seed-reason-status";
import { cleanupDemoStock } from "./seed-cleanup-demo-stock";
import { seedWarehouseInventoryDemo } from "./seed-warehouse-inventory";

const prisma = createPrismaClient();

async function loadDemoContext() {
  const demoTenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!demoTenant) {
    throw new Error('Demo tenant not found. Run `pnpm run db:seed:core` first.');
  }

  const users = await prisma.user.findMany({
    where: { tenantId: demoTenant.id },
    select: { id: true, email: true },
  });

  const usersByEmail = Object.fromEntries(users.map((u) => [u.email, { id: u.id }]));
  return { demoTenant, usersByEmail };
}

async function runProfile(profile: SeedProfile) {
  const started = Date.now();

  if (profile === "core") {
    await seedCore(prisma);
    console.log("Seeding regions/provinces for all tenants…");
    await seedRegionsAndProvincesForAllTenants(prisma);
    console.log(`Seed [core] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "status") {
    const { demoTenant } = await loadDemoContext();
    await seedReasonStatusesForTenant(prisma, demoTenant.id);
    console.log(`Seed [status] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "brs") {
    const { demoTenant, usersByEmail } = await loadDemoContext();
    await seedReasonStatusesForTenant(prisma, demoTenant.id);
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail);
    console.log(`Seed [brs] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "schedules") {
    const { demoTenant } = await loadDemoContext();
    await seedBranchSchedules(prisma, demoTenant.id);
    console.log(`Seed [schedules] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "branches") {
    console.log("Seeding regions/provinces for all tenants…");
    await seedRegionsAndProvincesForAllTenants(prisma);
    console.log("Seeding PSG branches for all tenants (may take a bit for ~1k rows)…");
    await seedPsgBranchesForAllTenants(prisma);
    console.log(`Seed [branches] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "psg") {
    console.log("Seeding PSG MODEL catalog (all tenants) + Outgoing stock (demo)…");
    await seedPsgModelAndOutgoing(prisma);
    console.log(`Seed [psg] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "warehouse") {
    const { demoTenant } = await loadDemoContext();
    await seedWarehouseInventoryDemo(prisma, demoTenant.id);
    console.log(`Seed [warehouse] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "cleanup-stock") {
    const { demoTenant } = await loadDemoContext();
    await cleanupDemoStock(prisma, demoTenant.id);
    console.log(`Seed [cleanup-stock] done in ${Date.now() - started}ms`);
    return;
  }

  if (profile === "notifications") {
    const { demoTenant, usersByEmail } = await loadDemoContext();
    await seedDemoNotifications(prisma, demoTenant.id, usersByEmail);
    console.log(`Seed [notifications] done in ${Date.now() - started}ms`);
    return;
  }

  const { demoTenant, usersByEmail } = await seedCore(prisma);
  console.log("Seeding regions/provinces for all tenants…");
  await seedRegionsAndProvincesForAllTenants(prisma);
  await seedReasonStatusesForTenant(prisma, demoTenant.id);
  await seedDemoNotifications(prisma, demoTenant.id, usersByEmail);

  if (profile === "full") {
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail);
    await seedBranchSchedules(prisma, demoTenant.id);
    console.log("Seeding PSG branches for all tenants (may take a bit for ~1k rows)…");
    await seedPsgBranchesForAllTenants(prisma);
    console.log(
      `Seed [full] done in ${Date.now() - started}ms — core + geo + status + notifications + BRS + PSG branches. See database/seed-users.md`,
    );
    return;
  }

  console.log(
    `Seed [minimal] done in ${Date.now() - started}ms — core + geo + status + notifications. Run \`pnpm run db:seed:full\` for BRS demo data, or \`pnpm run db:seed:branches\` for PSG branches.`,
  );
}

async function main() {
  const profile = resolveSeedProfile();
  await runProfile(profile);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
