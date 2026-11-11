/** @jest-environment jsdom */
import { printHtml } from "@/utils/print-html";

function printFrame(): HTMLIFrameElement {
  const frame = document.querySelector("iframe");
  if (!frame) throw new Error("No print frame on the page");
  return frame;
}

function loadFrame(frame: HTMLIFrameElement): jest.Mock {
  const print = jest.fn();
  (frame.contentWindow as Window).print = print;
  frame.dispatchEvent(new Event("load"));
  return print;
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("printHtml", () => {
  it("loads the document in a frame on this page instead of a popup", () => {
    const open = jest.spyOn(window, "open");
    printHtml("<h1>Release slip</h1>");
    expect(printFrame().srcdoc).toBe("<h1>Release slip</h1>");
    expect(open).not.toHaveBeenCalled();
  });

  it("prints only once the document has loaded", () => {
    printHtml("<h1>Release slip</h1>");
    const frame = printFrame();
    const print = jest.fn();
    (frame.contentWindow as Window).print = print;
    expect(print).not.toHaveBeenCalled();
    frame.dispatchEvent(new Event("load"));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("removes the frame after the print dialog closes", () => {
    printHtml("<h1>Release slip</h1>");
    const frame = printFrame();
    const contentWindow = frame.contentWindow as Window;
    loadFrame(frame);
    expect(document.querySelector("iframe")).not.toBeNull();
    contentWindow.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("keeps the frame out of the tab order and the accessibility tree", () => {
    printHtml("<h1>Release slip</h1>");
    expect(printFrame()).toHaveProperty("tabIndex", -1);
    expect(printFrame().getAttribute("aria-hidden")).toBe("true");
  });
});
