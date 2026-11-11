/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";

// sanitize-html's ESM parser does not load under Jest; sanitizing is not under test here.
jest.mock("@/features/announcements/lib/sanitize-announcement-html", () => ({
  announcementBodyToSafeHtml: (body: string) => ({
    html: body,
    isPlainText: !body.startsWith("<"),
  }),
}));

import { AnnouncementBody } from "@/features/announcements/components/announcement-body";

const TABLE_BODY =
  "<table><tbody><tr><th>MODEL</th><th>STATUS</th></tr><tr><td>32STV105</td><td>AVAILABLE</td></tr></tbody></table>";

let scrollHeight = 0;
let clientHeight = 0;
let resizeCallback: ResizeObserverCallback | null = null;

function bodyElement(text: string): HTMLElement {
  const element = screen.getByText(text).closest(".prose, .whitespace-pre-wrap");
  if (!(element instanceof HTMLElement)) throw new Error("body element not found");
  return element;
}

beforeEach(() => {
  scrollHeight = 0;
  clientHeight = 0;
  resizeCallback = null;
  jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockImplementation(() => scrollHeight);
  jest
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockImplementation(() => clientHeight);
  global.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AnnouncementBody", () => {
  it("keeps table layout in a clamped preview", () => {
    render(<AnnouncementBody body={TABLE_BODY} clamp />);

    const body = bodyElement("MODEL");
    expect(body.className).not.toContain("**:inline");
    expect(body.className).toContain("max-h-40");
    expect(body.querySelector("table")).not.toBeNull();
  });

  it("renders the full post when not clamped", () => {
    scrollHeight = 500;
    clientHeight = 100;
    render(<AnnouncementBody body={TABLE_BODY} expandable />);

    expect(bodyElement("MODEL").className).not.toContain("max-h-40");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the toggle when the post fits the preview", () => {
    scrollHeight = 100;
    clientHeight = 100;
    render(<AnnouncementBody body={TABLE_BODY} clamp expandable />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not offer a toggle unless expandable", () => {
    scrollHeight = 500;
    clientHeight = 100;
    render(<AnnouncementBody body={TABLE_BODY} clamp />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("expands and collapses a post that overflows", () => {
    scrollHeight = 500;
    clientHeight = 160;
    render(<AnnouncementBody body={TABLE_BODY} clamp expandable />);

    const toggle = screen.getByRole("button", { name: "Show more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(bodyElement("MODEL").className).not.toContain("max-h-40");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(bodyElement("MODEL").className).toContain("max-h-40");
    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
  });

  it("shows the toggle once content grows past the preview", () => {
    scrollHeight = 100;
    clientHeight = 100;
    render(<AnnouncementBody body={TABLE_BODY} clamp expandable />);
    expect(screen.queryByRole("button")).toBeNull();

    scrollHeight = 500;
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
  });

  it("expands legacy plain-text posts", () => {
    scrollHeight = 300;
    clientHeight = 60;
    render(<AnnouncementBody body="Plain legacy post" clamp expandable />);

    expect(bodyElement("Plain legacy post").className).toContain("line-clamp-3");

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(bodyElement("Plain legacy post").className).not.toContain("line-clamp-3");
  });
});
