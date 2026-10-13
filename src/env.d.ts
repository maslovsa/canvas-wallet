/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the risk-check Worker (a repo variable, not a secret). Empty or unset means a seed-only site. */
  readonly VITE_RISK_PROXY_URL?: string;
}
