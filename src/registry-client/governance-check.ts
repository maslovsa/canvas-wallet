// Eng review Outside Voice T1: the "PR-gated + CI-enforced schema" security
// model is a property of one specific repo's GitHub config (branch
// protection + CODEOWNERS) — it does NOT travel automatically when the
// generic multi-registry client points Studio at an arbitrary repo. This
// module does a best-effort check so the UI can show an honest
// "unverified governance" warning instead of implying every registry is
// as safe as the canonical one. It extends the registry-source indicator
// (viewing owner/repo) rather than replacing it.
import type { GovernanceStatus } from "../types.ts";

export async function checkGovernance(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GovernanceStatus> {
  const checkedAt = Date.now();
  try {
    const [branchRes, codeownersRes] = await Promise.all([
      fetchImpl(`https://api.github.com/repos/${owner}/${repo}/branches/main/protection`),
      fetchImpl(`https://api.github.com/repos/${owner}/${repo}/contents/.github/CODEOWNERS`),
    ]);
    // A 403 here (unauthenticated users can't read protection rules on many
    // repos) is genuinely "unknown", not "no protection" — never claim
    // false confidence in either direction.
    const hasBranchProtection: boolean | "unknown" =
      branchRes.status === 200 ? true : branchRes.status === 404 ? false : "unknown";
    const hasCodeowners: boolean | "unknown" =
      codeownersRes.status === 200 ? true : codeownersRes.status === 404 ? false : "unknown";
    return { hasBranchProtection, hasCodeowners, checkedAt };
  } catch {
    return { hasBranchProtection: "unknown", hasCodeowners: "unknown", checkedAt };
  }
}

export function governanceWarning(status: GovernanceStatus): string | undefined {
  if (status.hasBranchProtection === false || status.hasCodeowners === false) {
    return "This registry has no confirmed branch protection or required reviewer — its schema-validity is checked by this Studio, but nothing enforces human review before a token config is published here.";
  }
  if (status.hasBranchProtection === "unknown" || status.hasCodeowners === "unknown") {
    return "Couldn't confirm this registry's review process (branch protection / CODEOWNERS) — treat its contents with the same caution as any unverified third-party source.";
  }
  return undefined;
}
