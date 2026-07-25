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

// Where the currently-viewed list came from. "bundled" (public/lists/{id}.json,
// same-origin, no GitHub API calls) and "uploaded" (a local file, no network
// at all) are both offline-safe; "github" is the multi-registry client,
// which does depend on GitHub's API (rate-limit/governance caveats apply).
export type RegistrySource =
  | { kind: "bundled"; listId: string }
  | { kind: "uploaded"; filename: string }
  | { kind: "github"; owner: string; repo: string };

export interface GovernanceStatus {
  hasBranchProtection: boolean | "unknown";
  hasCodeowners: boolean | "unknown";
  checkedAt: number;
}

/** One entry in public/lists/manifest.json — the Gallery's card data. */
export interface ListMeta {
  id: string;
  name: string;
  description: string;
  file: string;
}
