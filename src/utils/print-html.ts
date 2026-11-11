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
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  });
  frame.srcdoc = html;
  document.body.append(frame);
}
