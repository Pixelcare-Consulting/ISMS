/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";

import { PageHeader } from "@/app/(app)/_components/page-header";

// Example component test: opt into the DOM with the docblock above.
describe("PageHeader", () => {
  it("renders the title as the page's h1", () => {
    render(<PageHeader title="Dashboard" sticky={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("renders the optional description and actions", () => {
    render(
      <PageHeader title="Orders" description="Track requests" actions={<button>New order</button>} />,
    );
    expect(screen.getByText("Track requests")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New order" })).toBeInTheDocument();
  });
});
