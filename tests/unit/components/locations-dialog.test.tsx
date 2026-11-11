/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";

import { LocationsDialog } from "@/components/locations-dialog";

const owner = {
  id: "w1",
  code: "W1",
  name: "Main",
  locations: [
    { id: "l1", code: "A1", name: "Aisle 1", isDefault: true },
    { id: "l2", code: "B2", name: "Bin 2", isDefault: false },
  ],
};

const base = {
  owner,
  ownerNoun: "warehouse",
  descriptionLead: "Bins or aisles inside",
  pending: false,
  onOpenChange: jest.fn(),
  onAdd: jest.fn(),
  onRemove: jest.fn(),
};

describe("LocationsDialog default location", () => {
  it("shows which location is the default", () => {
    render(<LocationsDialog {...base} onSetDefault={jest.fn()} />);

    const [first, second] = screen.getAllByRole("checkbox", { name: "Set as default" });
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
  });

  it("passes on the ticked location", () => {
    const onSetDefault = jest.fn();
    render(<LocationsDialog {...base} onSetDefault={onSetDefault} />);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Set as default" })[1]!);

    expect(onSetDefault).toHaveBeenCalledWith("w1", owner.locations[1], true);
  });

  it("has no tick for owners without a default location", () => {
    render(<LocationsDialog {...base} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
