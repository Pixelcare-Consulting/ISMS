import { displayModelName } from "@/features/orders/lib/worksheet-model-display";

describe("displayModelName", () => {
  it("drops a code repeated at the end of the name", () => {
    expect(displayModelName("100L10E-CS", "HS LTV CONSOLE & SUBWOOFER 100L10E-CS")).toBe(
      "HS LTV CONSOLE & SUBWOOFER",
    );
    expect(displayModelName("32STV105", 'DEVANT 32" HD VIDAA TV 32STV105')).toBe(
      'DEVANT 32" HD VIDAA TV',
    );
  });

  it("keeps a name that does not end with the code", () => {
    expect(displayModelName("100QUHV06", "D. Series Ultra High Definition Display")).toBe(
      "D. Series Ultra High Definition Display",
    );
  });
});
