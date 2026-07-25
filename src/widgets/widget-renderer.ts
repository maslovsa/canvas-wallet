import type { Widget, Token } from "../types.ts";
import { loadIcon } from "../icon/icon-loader.ts";
import { fetchPriceHistory, generatePlaceholderSeries, buildSparkline } from "./price-chart.ts";

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

const renderActionGroup: WidgetRenderer<Extract<Widget, { type: "action_group" }>> = (widget, _token, onAction) => {
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
  for (const item of widget.items) {
    const btn = document.createElement("button");
    btn.className = "action-group-btn";
    btn.textContent = item.label;
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

const SPARKLINE_WIDTH = 260;
const SPARKLINE_HEIGHT = 56;

function renderSparklineInto(container: HTMLElement, prices: number[], isPlaceholder: boolean): void {
  container.innerHTML = "";
  const { pathD, latest, changePct, isRising } = buildSparkline(prices, SPARKLINE_WIDTH, SPARKLINE_HEIGHT);

  const stats = document.createElement("div");
  stats.className = "price-chart-stats";
  const price = document.createElement("span");
  price.className = "price-chart-price";
  price.textContent = isPlaceholder ? "~" : `$${latest < 1 ? latest.toPrecision(3) : latest.toFixed(2)}`;
  const change = document.createElement("span");
  change.className = `price-chart-change ${isRising ? "price-chart-up" : "price-chart-down"}`;
  change.textContent = `${isRising ? "+" : ""}${changePct.toFixed(2)}%`;
  stats.append(price, change);
  container.append(stats);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`);
  svg.classList.add("price-chart-svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("class", isRising ? "price-chart-line-up" : "price-chart-line-down");
  svg.append(path);
  container.append(svg);

  if (isPlaceholder) {
    const caption = document.createElement("div");
    caption.className = "price-chart-caption";
    caption.textContent = "Sample chart — live price unavailable right now.";
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
  body.textContent = "Loading price…";
  el.append(body);

  const days = widget.days ?? 1;
  fetchPriceHistory(widget.coingeckoId, days).then((prices) => {
    if (prices && prices.length > 1) {
      renderSparklineInto(body, prices, false);
    } else {
      renderSparklineInto(body, generatePlaceholderSeries(widget.coingeckoId), true);
    }
  });

  return el;
};

const RENDERERS: { [K in Widget["type"]]: WidgetRenderer<Extract<Widget, { type: K }>> } = {
  banner: renderBanner,
  action_group: renderActionGroup,
  key_value: renderKeyValue,
  notice: renderNotice,
  price_chart: renderPriceChart,
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
