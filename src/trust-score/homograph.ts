import punycode from "punycode/";

// Homograph/IDN spoofing detection. Uses the established `punycode` package
// for IDN decode (the hard-to-get-right part) plus a simple, auditable
// mixed-script check using JS's built-in Unicode property escapes — NOT a
// hand-rolled full Unicode confusables table. The eng review's outside
// voice flagged that a bespoke confusables detector is a security feature
// easy to get subtly wrong, and a wrong-but-shipped check is worse than
// none; this scope (real IDN decode + straightforward same-script check,
// catching the single most common real-world attack — mixing Latin with a
// visually similar script like Cyrillic in one label) is deliberately
// narrower than full confusables detection, and is documented as such
// rather than presented as complete protection.
const SCRIPTS = ["Latin", "Cyrillic", "Greek"] as const;

function scriptsPresent(label: string): Set<string> {
  const present = new Set<string>();
  for (const script of SCRIPTS) {
    const re = new RegExp(`\\p{Script=${script}}`, "u");
    if (re.test(label)) present.add(script);
  }
  return present;
}

export interface HomographCheckResult {
  suspicious: boolean;
  reason?: string;
}

/** Flags a hostname if it's punycode-encoded, or if any label mixes two of Latin/Cyrillic/Greek. */
export function checkHomograph(hostname: string): HomographCheckResult {
  if (hostname.startsWith("xn--") || hostname.includes(".xn--")) {
    return { suspicious: true, reason: `Punycode-encoded domain (decodes to: ${punycode.toUnicode(hostname)})` };
  }
  for (const label of hostname.split(".")) {
    const scripts = scriptsPresent(label);
    if (scripts.size > 1) {
      return { suspicious: true, reason: `Label "${label}" mixes scripts: ${[...scripts].join(" + ")}` };
    }
  }
  return { suspicious: false };
}

export function checkUrlHomograph(url: string): HomographCheckResult {
  try {
    const { hostname } = new URL(url);
    return checkHomograph(hostname);
  } catch {
    return { suspicious: false };
  }
}
