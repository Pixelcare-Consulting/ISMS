import { shouldAutoDisableAccount } from "@/lib/auth/account-activity";

const now = new Date("2026-11-23T12:00:00.000Z");
const sevenDays = 7 * 24 * 60 * 60 * 1000;

describe("shouldAutoDisableAccount", () => {
  it("turns off an account whose last activity is older than 7 days", () => {
    expect(
      shouldAutoDisableAccount({
        isSuperAdmin: false,
        createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(now.getTime() - sevenDays - 1),
        now,
      }),
    ).toBe(true);
  });

  it("keeps an account that was active inside 7 days", () => {
    expect(
      shouldAutoDisableAccount({
        isSuperAdmin: false,
        createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(now.getTime() - sevenDays),
        now,
      }),
    ).toBe(false);
  });

  it("uses the created time when the person never signed in", () => {
    expect(
      shouldAutoDisableAccount({
        isSuperAdmin: false,
        createdAt: new Date(now.getTime() - sevenDays - 1),
        lastActiveAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("skips Super Admin", () => {
    expect(
      shouldAutoDisableAccount({
        isSuperAdmin: true,
        createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        now,
      }),
    ).toBe(false);
  });
});
