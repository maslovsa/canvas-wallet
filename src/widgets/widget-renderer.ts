import type { Widget, Token } from "../types.ts";
import { loadIcon } from "../icon/icon-loader.ts";
import { fetchPriceHistory, generatePlaceholderSeries, buildSparkline, buildChartGeometry, formatAxisPrice, formatPrice, formatPointTime, pointTime, rangeLabel } from "./price-chart.ts";
import { generateHistory, formatAmount, formatHistoryTimestamp } from "./history.ts";
import { readableTextColor } from "./color.ts";
import { icon } from "../ui/icons.ts";

/** Accent for the primary action when a token declares no ui.theme.primaryColor (the app accent). */
const DEFAULT_ACCENT = "#3375bb";

// type -> render-function lookup table (CEO review Section 1 recommendation)
// instead of if/else branching. Adding a 5th widget type means adding one
// entry here — the discriminated `Widget` union (generated from the schema)
// gives a compile error if a case is missing from RENDERERS, not just a
// silent runtime no-op.
type WidgetRenderer<W extends Widget> = (widget: W, token: Token, onAction: (actionKey: string) => void) => HTMLElement;

const renderBanner: WidgetRenderer<Extract<Widget, { type: "banner" }>> = (widget, _token, onAction) => {
  const el = document.createElement("div");
  el.className = "widget widget-banner";
  if (widget.icon) {
    const icon = document.createElement("span");
    icon.className = "widget-icon";
    loadIcon(widget.icon).then((src) => {
      if (src) icon.style.backgroundImage = `url(${CSS.escape(src)})`;
    });
    el.append(icon);
  }
  const text = document.createElement("div");
  text.className = "widget-text";
  const title = document.createElement("div");
  title.className = "widget-title";
  title.textContent = widget.title;
  text.append(title);
  if (widget.description) {
    const desc = document.createElement("div");
    desc.className = "widget-description";
    desc.textContent = widget.description;
    text.append(desc);
  }
  el.append(text);
  const btn = document.createElement("button");
  btn.className = "widget-action-btn";
  btn.textContent = "Open";
  btn.addEventListener("click", () => onAction(widget.action));
  el.append(btn);
  return el;
};

const renderActionGroup: WidgetRenderer<Extract<Widget, { type: "action_group" }>> = (widget, token, onAction) => {
  const el = document.createElement("div");
  el.className = "widget widget-action-group";
  if (widget.title) {
    const title = document.createElement("div");
    title.className = "widget-title";
    title.textContent = widget.title;
    el.append(title);
  }
  const row = document.createElement("div");
  row.className = "action-group-row";
  // The wallet's own actions stand out: Send is the primary action (tall, filled with the token's accent),
  // Receive its secondary (same height, accent outline). Everything else keeps the quiet capsule style.
  const accent = token.ui?.theme?.primaryColor ?? DEFAULT_ACCENT;
  for (const item of widget.items) {
    const btn = document.createElement("button");
    btn.className = "action-group-btn";
    const kind = token.actions?.[item.action]?.type;
    if (kind === "send" || kind === "receive") {
      btn.classList.add(kind === "send" ? "action-primary" : "action-secondary");
      btn.style.setProperty("--action-accent", accent);
      btn.style.setProperty("--action-accent-text", readableTextColor(accent));
    }
    if (kind === "send") btn.append(icon("arrow-up-right", { size: 19, strokeWidth: 2.25 }));
    if (kind === "receive") btn.append(icon("arrow-down-left", { size: 19, strokeWidth: 2.25 }));
    btn.append(document.createTextNode(item.label));
    btn.addEventListener("click", () => onAction(item.action));
    row.append(btn);
  }
  el.append(row);
  return el;
};

const renderKeyValue: WidgetRenderer<Extract<Widget, { type: "key_value" }>> = (widget) => {
  const el = document.createElement("div");
  el.className = "widget widget-key-value";
  if (widget.title) {
    const title = document.createElement("div");
    title.className = "widget-title";
    title.textContent = widget.title;
    el.append(title);
  }
  for (const item of widget.items) {
    const row = document.createElement("div");
    row.className = "key-value-row";
    const label = document.createElement("span");
    label.className = "key-value-label";
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "key-value-value";
    value.textContent = item.value;
    row.append(label, value);
    el.append(row);
  }
  return el;
};

const renderNotice: WidgetRenderer<Extract<Widget, { type: "notice" }>> = (widget) => {
  const el = document.createElement("div");
  el.className = `widget widget-notice widget-notice-${widget.severity ?? "info"}`;
  el.textContent = widget.message;
  return el;
};

/** "+1.23%", "-0.40%", and a plain "0.00%" (not a red "-0.00%") when the move rounds to nothing. */
function formatChange(pct: number): string {
  const rounded = pct.toFixed(2);
  return Number(rounded) === 0 ? "0.00%" : `${pct > 0 ? "+" : ""}${rounded}%`;
}

const CHART_LAYOUT = { width: 320, height: 132, padTop: 10, padBottom: 8, gutterRight: 0 };
const SVG_NS = "http://www.w3.org/2000/svg";
let chartCounter = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function renderChartInto(container: HTMLElement, prices: number[], days: number, isPlaceholder: boolean): void {
  container.innerHTML = "";
  container.removeAttribute("aria-busy");
  container.removeAttribute("aria-label");
  const { latest, changePct, isRising } = buildSparkline(prices, CHART_LAYOUT.width, CHART_LAYOUT.height);
  // the line runs the full width of the card; grid labels sit just above their grid line, at the left
  const geo = buildChartGeometry(prices, CHART_LAYOUT);
  const direction = isRising ? "up" : "down";

  const stats = document.createElement("div");
  stats.className = "price-chart-stats";
  const price = document.createElement("span");
  price.className = "price-chart-price";
  price.textContent = isPlaceholder ? "Price unavailable" : formatPrice(latest);
  stats.append(price);
  let change: HTMLElement | null = null;
  let when: HTMLElement | null = null;
  if (!isPlaceholder) {
    // A sample series has no real price or change, so none is shown (an invented "+18%" on a stablecoin misleads).
    change = document.createElement("span");
    change.className = `price-chart-change price-chart-${direction}`;
    change.textContent = formatChange(changePct);
    when = document.createElement("span");
    when.className = "price-chart-when";
    when.textContent = rangeLabel(days).replace(" ago", "");
    stats.append(change, when);
  }
  container.append(stats);

  const gradientId = `pc-fill-${++chartCounter}`;
  const svg = svgEl("svg", { viewBox: `0 0 ${CHART_LAYOUT.width} ${CHART_LAYOUT.height}`, role: "img" });
  svg.setAttribute("aria-label", isPlaceholder ? "Sample chart" : `Price over the last ${days <= 1 ? "24 hours" : `${Math.round(days)} days`}`);
  svg.classList.add("price-chart-svg", `price-chart-svg-${direction}`);
  const defs = svgEl("defs");
  const gradient = svgEl("linearGradient", { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(svgEl("stop", { offset: "0%", "stop-opacity": 0.28, class: "price-chart-stop" }), svgEl("stop", { offset: "100%", "stop-opacity": 0, class: "price-chart-stop" }));
  defs.append(gradient);
  svg.append(defs);

  for (const tick of geo.ticks) {
    svg.append(svgEl("line", { x1: 0, x2: geo.plotRight, y1: tick.y.toFixed(1), y2: tick.y.toFixed(1), class: "price-chart-grid" }));
    if (!isPlaceholder) {
      const label = svgEl("text", { x: 0, y: (tick.y - 3.5).toFixed(1), "text-anchor": "start", class: "price-chart-axis" });
      label.textContent = formatAxisPrice(tick.value, (geo.ticks[0]!.value - geo.ticks[1]!.value) || 0);
      svg.append(label);
    }
  }
  svg.append(svgEl("path", { d: geo.areaPath, fill: `url(#${gradientId})`, class: "price-chart-area" }));
  svg.append(svgEl("path", { d: geo.linePath, class: `price-chart-line price-chart-line-${direction}` }));
  const end = geo.points[geo.points.length - 1]!;
  svg.append(svgEl("circle", { cx: end.x.toFixed(1), cy: end.y.toFixed(1), r: 7, class: "price-chart-halo" }), svgEl("circle", { cx: end.x.toFixed(1), cy: end.y.toFixed(1), r: 3.5, class: "price-chart-dot" }));

  // Scrub: a crosshair follows the finger or pointer and the headline shows that moment's price and move.
  const cursor = svgEl("line", { y1: 0, y2: CHART_LAYOUT.height, class: "price-chart-cursor" });
  const cursorDot = svgEl("circle", { r: 4.5, class: "price-chart-cursor-dot" });
  cursor.style.display = "none";
  cursorDot.style.display = "none";
  svg.append(cursor, cursorDot);
  container.append(svg);

  const axis = document.createElement("div");
  axis.className = "price-chart-time";
  const startLabel = document.createElement("span");
  startLabel.textContent = rangeLabel(days);
  const endLabel = document.createElement("span");
  endLabel.textContent = "Now";
  axis.append(startLabel, endLabel);
  container.append(axis);

  if (!isPlaceholder && change && when) {
    const first = prices[0]!;
    const now = Date.now();
    const show = (index: number | null) => {
      const i = index ?? prices.length - 1;
      const value = prices[i]!;
      const pct = first === 0 ? 0 : ((value - first) / first) * 100;
      price.textContent = formatPrice(value);
      change!.textContent = formatChange(pct);
      change!.className = `price-chart-change price-chart-${pct >= 0 ? "up" : "down"}`;
      when!.textContent = index === null ? rangeLabel(days).replace(" ago", "") : formatPointTime(pointTime(i, prices.length, days, now), days);
      const hidden = index === null ? "none" : "";
      cursor.style.display = hidden;
      cursorDot.style.display = hidden;
      if (index !== null) {
        const point = geo.points[i]!;
        cursor.setAttribute("x1", point.x.toFixed(1));
        cursor.setAttribute("x2", point.x.toFixed(1));
        cursorDot.setAttribute("cx", point.x.toFixed(1));
        cursorDot.setAttribute("cy", point.y.toFixed(1));
      }
    };
    const indexAt = (clientX: number): number => {
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / (rect.width || 1)) * CHART_LAYOUT.width;
      return Math.max(0, Math.min(prices.length - 1, Math.round((x / geo.plotRight) * (prices.length - 1))));
    };
    svg.addEventListener("pointermove", (e) => show(indexAt(e.clientX)));
    svg.addEventListener("pointerdown", (e) => show(indexAt(e.clientX)));
    for (const type of ["pointerleave", "pointercancel", "pointerup"] as const) svg.addEventListener(type, () => show(null));
  }

  if (isPlaceholder) {
    const caption = document.createElement("div");
    caption.className = "price-chart-caption";
    caption.textContent = "Illustrative sample chart, not real prices. Live data is unavailable right now.";
    container.append(caption);
  }
}

const renderPriceChart: WidgetRenderer<Extract<Widget, { type: "price_chart" }>> = (widget, token) => {
  const el = document.createElement("div");
  el.className = "widget widget-price-chart";

  const title = document.createElement("div");
  title.className = "widget-title";
  title.textContent = widget.title ?? `${token.symbol} price`;
  el.append(title);

  const body = document.createElement("div");
  body.className = "price-chart-body";
  // A skeleton in the shape of the result (price + chart) instead of a line of text: no layout jump when it lands.
  body.setAttribute("aria-busy", "true");
  body.setAttribute("aria-label", "Loading price");
  for (const shape of ["price-skeleton-price", "price-skeleton-chart"]) {
    const bar = document.createElement("div");
    bar.className = `skeleton ${shape}`;
    body.append(bar);
  }
  el.append(body);

  const days = widget.days ?? 1;
  fetchPriceHistory(widget.coingeckoId, days).then((prices) => {
    if (prices && prices.length > 1) {
      renderChartInto(body, prices, days, false);
    } else {
      renderChartInto(body, generatePlaceholderSeries(widget.coingeckoId), days, true);
    }
  });

  return el;
};

const renderHistory: WidgetRenderer<Extract<Widget, { type: "history" }>> = (widget, token) => {
  const el = document.createElement("div");
  el.className = "widget widget-history";

  const title = document.createElement("div");
  title.className = "widget-title";
  title.textContent = widget.title ?? "Recent Activity";
  el.append(title);

  // Seeded by the token's own id — same token shows a stable feed across
  // re-renders. Newest first, like every wallet app's activity list.
  const isStablecoin = token.tags?.includes("stablecoin") ?? false;
  const events = generateHistory(`${token.id}:${token.symbol}`, 5, isStablecoin);
  for (const event of events) {
    const row = document.createElement("div");
    row.className = "history-row";

    const icon = document.createElement("span");
    icon.className = `history-icon history-icon-${event.direction}`;
    icon.textContent = event.direction === "in" ? "↓" : "↑";
    row.append(icon);

    const details = document.createElement("span");
    details.className = "history-details";
    const label = document.createElement("span");
    label.className = "history-label";
    label.textContent = `${event.direction === "in" ? "Received" : "Sent"} ${formatAmount(event.amount)} ${token.symbol}`;
    details.append(label);
    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = formatHistoryTimestamp(event.timestamp);
    details.append(time);
    row.append(details);

    const usd = document.createElement("span");
    usd.className = `history-usd history-usd-${event.direction}`;
    usd.textContent = `${event.direction === "in" ? "+" : "-"}$${event.usd.toFixed(2)}`;
    row.append(usd);

    el.append(row);
  }

  return el;
};

const RENDERERS: { [K in Widget["type"]]: WidgetRenderer<Extract<Widget, { type: K }>> } = {
  banner: renderBanner,
  action_group: renderActionGroup,
  key_value: renderKeyValue,
  notice: renderNotice,
  price_chart: renderPriceChart,
  history: renderHistory,
};

/**
 * Render a widget. Per tz.md's own requirement, an unknown widget.type must
 * be silently ignored (return null), never crash the card — but that case
 * can only occur for hand-edited JSON that skipped schema validation, since
 * the generated `Widget` type is exhaustive over RENDERERS at compile time.
 */
export function renderWidget(
  widget: Widget,
  token: Token,
  onAction: (actionKey: string) => void,
): HTMLElement | null {
  const renderer = RENDERERS[widget.type] as WidgetRenderer<Widget> | undefined;
  if (!renderer) {
    console.warn(`[widget-renderer] Unknown widget.type "${(widget as { type: string }).type}" — ignored, not rendered.`);
    return null;
  }
  return renderer(widget, token, onAction);
}
