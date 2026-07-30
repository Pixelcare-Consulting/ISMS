import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { seedBranchSchedules } from "./seed-branch-schedules";
import { seedBrsDemoData } from "./seed-brs";
import { seedCore } from "./seed-core";
import { resolveSeedProfile, type SeedProfile } from "./seed-data";
import { seedRegionsAndProvincesForAllTenants } from "./seed-ph-geo";
import { seedPsgBranchesForAllTenants } from "./seed-psg-branches";
import { seedReasonStatusesForTenant } from "./seed-reason-status";

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
    const statusCodes = await seedReasonStatusesForTenant(prisma, demoTenant.id);
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail, statusCodes);
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

  const { demoTenant, usersByEmail } = await seedCore(prisma);
  console.log("Seeding regions/provinces for all tenants…");
  await seedRegionsAndProvincesForAllTenants(prisma);
  const statusCodes = await seedReasonStatusesForTenant(prisma, demoTenant.id);

  if (profile === "full") {
    await seedBrsDemoData(prisma, demoTenant.id, usersByEmail, statusCodes);
    await seedBranchSchedules(prisma, demoTenant.id);
    console.log("Seeding PSG branches for all tenants (may take a bit for ~1k rows)…");
    await seedPsgBranchesForAllTenants(prisma);
    console.log(
      `Seed [full] done in ${Date.now() - started}ms — core + geo + status + BRS + PSG branches. See database/seed-users.md`,
    );
    return;
  }

  console.log(
    `Seed [minimal] done in ${Date.now() - started}ms — core + geo + status. Run \`pnpm run db:seed:full\` for BRS demo data, or \`pnpm run db:seed:branches\` for PSG branches.`,
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
