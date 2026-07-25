// Advisory only — can be gamed by a coordinated fake website + action URL,
// since website/explorer are unrestricted strings, not validated as
// canonical (CEO review Outside Voice T4). The real defense is the human
// PR reviewer (CODEOWNERS), not this heuristic. Flags a mismatch as a
// signal worth a second look, never blocks anything.
export interface DomainMismatchResult {
  mismatched: boolean;
  actionDomain?: string;
  declaredDomain?: string;
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function checkDomainMismatch(actionUrl: string, declaredWebsite: string | undefined): DomainMismatchResult {
  const actionDomain = hostnameOf(actionUrl);
  const declaredDomain = declaredWebsite ? hostnameOf(declaredWebsite) : undefined;
  if (!actionDomain || !declaredDomain) return { mismatched: false };
  return { mismatched: actionDomain !== declaredDomain, actionDomain, declaredDomain };
}
