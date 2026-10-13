// Renders text as a QR code in an inline SVG (no canvas, no image URL, no network). Built with
// createElementNS only: the encoded text never reaches innerHTML. One <path> holds every dark module.
import qrcode from "qrcode-generator";

const SVG_NS = "http://www.w3.org/2000/svg";
const QUIET_ZONE = 4; // modules of white margin, required by the QR spec for reliable scanning

export function renderQrSvg(text: string, label: string): SVGSVGElement {
  const qr = qrcode(0, "M"); // type 0 = smallest version that fits
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + QUIET_ZONE * 2;

  let d = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.classList.add("receive-qr");

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#ffffff"); // always white/black: scanners need contrast, whatever the phone theme
  const modules = document.createElementNS(SVG_NS, "path");
  modules.setAttribute("d", d);
  modules.setAttribute("fill", "#000000");
  svg.append(bg, modules);
  return svg;
}
