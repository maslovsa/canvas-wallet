// Hand-written app-level types. Registry/token/widget/action shapes live in
// src/generated/registry-schema.d.ts — generated from registry.schema.json,
// never edited by hand (see package.json's gen:schema-types script).
export type {
  TokenUIStudioRegistry as Registry,
  Network,
  Token,
  Ui,
  Action,
  ActionExternalUrl,
  ActionDeeplink,
  ActionWalletConnect,
  Widget,
  WidgetBanner,
  WidgetActionGroup,
  WidgetKeyValue,
  WidgetNotice,
} from "./generated/registry-schema.d.ts";

export interface RegistrySource {
  owner: string;
  repo: string;
  /** true for the project's own bundled/default registry — no GitHub API calls needed at all. */
  isDefault: boolean;
}

export interface GovernanceStatus {
  hasBranchProtection: boolean | "unknown";
  hasCodeowners: boolean | "unknown";
  checkedAt: number;
}
