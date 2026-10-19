/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";

import { WorksheetModelLabel } from "@/app/(app)/orders/_components/worksheet-model-label";

describe("WorksheetModelLabel", () => {
  it("puts the full code and the full name on separate lines", () => {
    render(
      <WorksheetModelLabel
        skuCode="100QUHV06"
        name="D. Series Ultra High Definition Display"
      />,
    );

    const code = screen.getByText("100QUHV06");
    const name = screen.getByText("D. Series Ultra High Definition Display");

    expect(code.tagName).toBe("P");
    expect(name.tagName).toBe("P");
    expect(code.className).toMatch(/font-medium/);
    expect(name.className).toMatch(/text-\[11px\]/);
    expect(name.className).toMatch(/font-normal/);
    expect(name.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(name.className).toMatch(/whitespace-normal/);
    expect(name.className).toMatch(/break-words/);
  });

  it("does not repeat a code already shown on the first line", () => {
    render(
      <WorksheetModelLabel
        skuCode="100L10E-CS"
        name="HS LTV CONSOLE & SUBWOOFER 100L10E-CS"
      />,
    );
    expect(screen.getByText("HS LTV CONSOLE & SUBWOOFER")).toBeInTheDocument();
    expect(screen.getAllByText("100L10E-CS")).toHaveLength(1);
  });
});
