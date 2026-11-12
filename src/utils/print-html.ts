/** Longest the dialog waits on web fonts; past this the slip prints in the fallback font. */
const FONT_WAIT_MS = 3000;

/**
 * Resolves once the fonts the page uses have loaded. Reading layout first makes the
 * browser request them, so `fonts.ready` covers them. A failed font load also resolves.
 */
function fontsLoaded(printWindow: Window, fonts: FontFaceSet): Promise<void> {
  void printWindow.document.body?.offsetHeight;
  const timeout = new Promise<void>((resolve) => printWindow.setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([fonts.ready.then(() => undefined), timeout]);
}

/**
 * Prints a full HTML document through a hidden frame on this page. A popup will not do:
 * `window.open` returns null with `noopener`, and blockers stop one opened after a server
 * call, which is when RS and DR print.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Not display:none or visibility:hidden, which print blank in some browsers.
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.addEventListener("load", () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      return;
    }
    const print = () => {
      printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
      printWindow.focus();
      printWindow.print();
    };
    // jsdom and older engines have no FontFaceSet; print straight away there.
    const fonts = printWindow.document.fonts as FontFaceSet | undefined;
    if (!fonts) {
      print();
      return;
    }
    void fontsLoaded(printWindow, fonts).then(print);
  });
  frame.srcdoc = html;
  document.body.append(frame);
}
