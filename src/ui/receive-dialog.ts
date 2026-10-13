// The Receive dialog: token + network, a QR code of the receiving address, the address itself and a
// Copy button, inside the phone (phone-overlay). The address is a demo stub, and the dialog says so.
import type { Token } from "../types.ts";
import { copyText } from "../receive/copy-text.ts";
import { renderQrSvg } from "../receive/qr-svg.ts";
import { openOverlay, type OpenOverlay } from "./phone-overlay.ts";
import type { ChromeStyle } from "./phone-frame.ts";

export interface ReceiveDialogOptions {
  frame: HTMLElement;
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  token: Token;
  networkName: string;
  address: string;
}

const COPIED_FEEDBACK_MS = 1600;

export function openReceiveDialog(options: ReceiveDialogOptions): OpenOverlay {
  const { token, networkName, address } = options;

  const content = document.createElement("div");
  content.className = "receive-content";
  const qr = renderQrSvg(address, `QR code of the ${token.symbol} receiving address on ${networkName}`);
  const qrFrame = document.createElement("div");
  qrFrame.className = "receive-qr-frame";
  qrFrame.append(qr);
  const addressEl = document.createElement("code");
  addressEl.className = "receive-address";
  addressEl.textContent = address;
  const note = document.createElement("p");
  note.className = "receive-note";
  note.textContent = `Send only ${token.symbol} on ${networkName} to this address. Demo address, not for real funds.`;
  const status = document.createElement("div");
  status.className = "receive-status";
  status.setAttribute("role", "status");
  content.append(qrFrame, addressEl, note, status);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const overlay: OpenOverlay = openOverlay({
    frame: options.frame,
    screen: options.screen,
    chromeStyle: options.chromeStyle,
    tone: "info",
    title: `Receive ${token.symbol}`,
    body: `Network: ${networkName}`,
    content,
    buttons: [
      {
        label: "Copy address",
        primary: true,
        onClick: (button) => {
          void copyText(address).then((ok) => {
            status.textContent = ok ? "Address copied" : "Copy failed. Select the address and copy it manually.";
            button.textContent = ok ? "Copied ✓" : "Copy address";
            clearTimeout(timer);
            timer = setTimeout(() => {
              button.textContent = "Copy address";
              status.textContent = "";
            }, COPIED_FEEDBACK_MS);
          });
        },
      },
      { label: "Close", onClick: () => close() },
    ],
    onDismiss: () => close(),
  });
  function close(): void {
    clearTimeout(timer);
    overlay.close();
  }
  return { element: overlay.element, close };
}
