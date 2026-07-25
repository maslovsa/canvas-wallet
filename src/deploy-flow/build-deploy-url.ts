import type { Token, RegistrySource } from "../types.ts";
import { getDefaultBranchCached, RateLimitSignal, NotFoundSignal, NetworkSignal } from "../registry-client/session-cache.ts";

const MAX_PREFILL_LENGTH = 4000; // Conservative threshold — design doc Next Steps #3.

export interface DeployPlan {
  kind: "pr_prep_link" | "download_fallback";
  url?: string;
  filename: string;
  json: string;
  reason?: string; // Why it fell back to download, for the UI to explain.
}

/**
 * Builds either a GitHub "propose new file" prefilled URL, or a download
 * fallback — never guesses a branch name, and always falls back cleanly if
 * the default_branch lookup fails or the encoded config is too large.
 */
export async function buildDeployPlan(
  source: RegistrySource,
  network: string,
  token: Token,
  fetchImpl: typeof fetch = fetch,
): Promise<DeployPlan> {
  const json = JSON.stringify(token, null, 2);
  const filename = `${network}/${token.symbol}.json`;

  let defaultBranch: string;
  try {
    defaultBranch = (await getDefaultBranchCached(source.owner, source.repo, fetchImpl)).defaultBranch;
  } catch (err) {
    const reason =
      err instanceof RateLimitSignal
        ? "Rate-limited by GitHub while looking up the default branch."
        : err instanceof NotFoundSignal
          ? "Couldn't find the registry repository."
          : err instanceof NetworkSignal
            ? "Network error while looking up the default branch."
            : "Couldn't determine the registry's default branch.";
    return { kind: "download_fallback", filename, json, reason };
  }

  const encoded = encodeURIComponent(json);
  const url = `https://github.com/${source.owner}/${source.repo}/new/${defaultBranch}?filename=${encodeURIComponent(filename)}&value=${encoded}`;

  if (url.length > MAX_PREFILL_LENGTH) {
    return {
      kind: "download_fallback",
      filename,
      json,
      reason: "This config is too large for GitHub's prefilled-URL flow — add it to your fork manually.",
    };
  }

  return { kind: "pr_prep_link", url, filename, json };
}
