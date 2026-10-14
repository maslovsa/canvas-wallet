// The app's icon set: Lucide (ISC license, https://lucide.dev), 24x24 stroke icons that scale and take the
// current text color. Only the icons listed here end up in the bundle. Icons are decorative by default (the
// button that holds one carries the accessible name).
import {
  createElement,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BookUser,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  GitPullRequest,
  Layers,
  LayoutGrid,
  Link2,
  Monitor,
  Moon,
  Plus,
  Search,
  Share2,
  Smartphone,
  Sun,
  Upload,
  X,
  type IconNode,
} from "lucide";

const ICONS = {
  "arrow-down-left": ArrowDownLeft,
  "arrow-left": ArrowLeft,
  "arrow-up-right": ArrowUpRight,
  "book-user": BookUser,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  copy: Copy,
  download: Download,
  "external-link": ExternalLink,
  "file-json": FileJson,
  "git-pull-request": GitPullRequest,
  layers: Layers,
  "layout-grid": LayoutGrid,
  link: Link2,
  monitor: Monitor,
  moon: Moon,
  plus: Plus,
  search: Search,
  share: Share2,
  smartphone: Smartphone,
  sun: Sun,
  upload: Upload,
  x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export interface IconOptions {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function icon(name: IconName, options: IconOptions = {}): SVGElement {
  const size = options.size ?? 16;
  const svg = createElement(ICONS[name], {
    width: size,
    height: size,
    "stroke-width": options.strokeWidth ?? 1.75,
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.classList.add("icon");
  if (options.className) svg.classList.add(...options.className.split(" "));
  return svg;
}

/** Builds an icon-only or icon+label button. `label` is always the accessible name (and the tooltip). */
export function iconButton(name: IconName, label: string, options: IconOptions & { showLabel?: boolean; className?: string } = {}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn${options.className ? ` ${options.className}` : ""}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(name, options));
  if (options.showLabel) {
    const text = document.createElement("span");
    text.className = "icon-btn-label";
    text.textContent = label;
    button.append(text);
    button.removeAttribute("aria-label"); // the visible text is the name
  }
  return button;
}
