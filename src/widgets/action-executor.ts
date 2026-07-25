import type { Action, Token } from "../types.ts";

// type -> handler lookup table, mirroring widget-renderer.ts's pattern.
// This is the Studio SIMULATOR: clicking a widget shows a demo alert with
// the action type + resolved target URL (tz.md's own spec — "показывать
// демо-алерт с типом действия и целевым URL"), it never actually navigates
// or executes anything. A real wallet consuming this schema would replace
// this module with real navigation, but it MUST still show the same
// interstitial warning before leaving to a third-party destination
// (design doc constraint).

const SUBSTITUTION_KEYS = ["symbol", "id", "user_address"] as const;
type SubstitutionKey = (typeof SUBSTITUTION_KEYS)[number];

/** Replace {symbol}/{id}/{user_address} only — no arbitrary key interpolation — URL-encoding each value. */
function substituteUrl(template: string, token: Token, userAddress: string | undefined): string {
  const values: Record<SubstitutionKey, string> = {
    symbol: token.symbol,
    id: token.id,
    user_address: userAddress ?? "",
  };
  return template.replace(/\{(symbol|id|user_address)\}/g, (_match, key: SubstitutionKey) =>
    encodeURIComponent(values[key]),
  );
}

export interface ActionResult {
  type: Action["type"];
  targetUrl: string;
  requiresInterstitial: boolean;
}

type ActionHandler<A extends Action> = (action: A, token: Token, userAddress: string | undefined) => ActionResult;

const handleExternalUrl: ActionHandler<Extract<Action, { type: "external_url" }>> = (action, token, userAddress) => ({
  type: "external_url",
  targetUrl: substituteUrl(action.url, token, userAddress),
  requiresInterstitial: true,
});

const handleDeeplink: ActionHandler<Extract<Action, { type: "deeplink" }>> = (action, token, userAddress) => ({
  type: "deeplink",
  targetUrl: substituteUrl(action.url, token, userAddress),
  requiresInterstitial: false,
});

const handleWalletConnect: ActionHandler<Extract<Action, { type: "wallet_connect" }>> = (action) => ({
  type: "wallet_connect",
  targetUrl: action.dappUrl,
  requiresInterstitial: true,
});

const HANDLERS: { [K in Action["type"]]: ActionHandler<Extract<Action, { type: K }>> } = {
  external_url: handleExternalUrl,
  deeplink: handleDeeplink,
  wallet_connect: handleWalletConnect,
};

/** Resolve an action key against a token's `actions` map. Unknown action -> disabled, per tz.md. */
export function resolveAction(
  actionKey: string,
  token: Token,
  userAddress: string | undefined,
): ActionResult | null {
  const action = token.actions?.[actionKey];
  if (!action) {
    console.warn(`[action-executor] Unknown action key "${actionKey}" on token ${token.symbol} — ignored.`);
    return null;
  }
  const handler = HANDLERS[action.type] as ActionHandler<Action> | undefined;
  if (!handler) {
    console.warn(`[action-executor] Unknown action.type "${(action as { type: string }).type}" — ignored.`);
    return null;
  }
  return handler(action, token, userAddress);
}

/** Demo-alert copy the live simulator shows on click, modeling the required interstitial warning. */
export function demoAlertMessage(result: ActionResult, token: Token): string {
  const interstitial = result.requiresInterstitial
    ? `\n\nYou're leaving to a third-party dApp for ${token.symbol}. (Simulated — no real navigation occurs.)`
    : "";
  return `Action: ${result.type}\nTarget: ${result.targetUrl}${interstitial}`;
}
