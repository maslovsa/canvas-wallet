import type { Token } from "../types.ts";
import { checkBadgeContrast } from "./contrast.ts";
import { checkUrlHomograph } from "./homograph.ts";
import { checkDomainMismatch } from "./domain-mismatch.ts";
import { checkWidgetCount } from "./widget-count.ts";

export type TrustScoreSeverity = "info" | "warning";

export interface TrustScoreFinding {
  check: "contrast" | "homograph" | "domain_mismatch" | "widget_count";
  severity: TrustScoreSeverity;
  message: string;
}

/**
 * All checks here are advisory only, shown as a score/warning list in the
 * editor — none of them block CI merge; CI still only enforces schema
 * validity (design doc + CEO review item 1 detail). No external calls: all
 * checks are static/client-side, respecting the "no backend" constraint.
 */
export function computeTrustScore(token: Token): TrustScoreFinding[] {
  const findings: TrustScoreFinding[] = [];

  if (token.ui?.theme?.badgeText && token.ui.theme.primaryColor && token.ui.background) {
    const contrast = checkBadgeContrast(
      "#FFFFFF", // badge text renders white-on-color per the design; check against that.
      token.ui.theme.primaryColor,
      token.ui.background.colors,
    );
    if (!contrast.passes) {
      findings.push({
        check: "contrast",
        severity: "warning",
        message: `Badge text may be hard to read against ${contrast.worstAgainst} (contrast ratio ${contrast.worstRatio.toFixed(2)}, WCAG AA wants ≥4.5).`,
      });
    }
  }

  for (const [actionKey, action] of Object.entries(token.actions ?? {})) {
    const url = action.type === "external_url" ? action.url : action.type === "deeplink" ? action.url : action.type === "wallet_connect" ? action.dappUrl : undefined;
    if (!url) continue;

    const homograph = checkUrlHomograph(url);
    if (homograph.suspicious) {
      findings.push({
        check: "homograph",
        severity: "warning",
        message: `Action "${actionKey}": ${homograph.reason}. Note: this is a narrow same-script check, not full Unicode confusables detection — a human reviewer should still look.`,
      });
    }

    const mismatch = checkDomainMismatch(url, token.website);
    if (mismatch.mismatched) {
      findings.push({
        check: "domain_mismatch",
        severity: "info",
        message: `Action "${actionKey}" points to ${mismatch.actionDomain}, which differs from the declared website (${mismatch.declaredDomain}). Advisory only — can be gamed by a coordinated fake website + action URL; the real defense is human PR review, not this heuristic.`,
      });
    }
  }

  const widgetCount = checkWidgetCount(token.widgets);
  if (widgetCount.excessive) {
    findings.push({
      check: "widget_count",
      severity: "info",
      message: `${widgetCount.count} widgets on this card — more than 4 is likely UX clutter.`,
    });
  }

  return findings;
}
