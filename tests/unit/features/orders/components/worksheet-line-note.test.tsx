/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { WorksheetLineNote } from "@/app/(app)/orders/_components/worksheet-line-note";

function NoteHarness() {
  const [value, setValue] = useState("a");
  return (
    <WorksheetLineNote value={value} label="SP remarks for SKU" onChange={setValue} />
  );
}

describe("WorksheetLineNote", () => {
  it("keeps the same input focused while the note grows", () => {
    render(<NoteHarness />);
    const input = screen.getByRole("textbox", { name: "SP remarks for SKU" });
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "ab" } });

    const after = screen.getByRole("textbox", { name: "SP remarks for SKU" });
    expect(after).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(after).toHaveValue("ab");
  });
});
