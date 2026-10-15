// First-run coaching for the Send screen: small, one-at-a-time hints that point at the next useful control and are
// remembered once seen. Each hint is shown at most once per browser (localStorage, guarded: private windows and blocked
// storage fall back to "once per page view" so a hint never nags on every re-mount). Nothing here blocks the screen.
export type CoachHint = "book" | "pick";

const PREFIX = "aegis-coach:";
const seenThisPage = new Set<CoachHint>();

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function hasSeenHint(id: CoachHint, storage: Pick<Storage, "getItem"> | undefined = safeStorage()): boolean {
  if (seenThisPage.has(id)) return true;
  try {
    return storage?.getItem(PREFIX + id) === "1";
  } catch {
    return false;
  }
}

export function markHintSeen(id: CoachHint, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  seenThisPage.add(id);
  try {
    storage?.setItem(PREFIX + id, "1");
  } catch {
    // remembered for this page view only
  }
}

/** Forgets every hint (demo replays, tests). */
export function resetHints(storage: Pick<Storage, "removeItem"> | undefined = safeStorage()): void {
  for (const id of ["book", "pick"] as const) {
    seenThisPage.delete(id);
    try {
      storage?.removeItem(PREFIX + id);
    } catch {
      // nothing stored to forget
    }
  }
}
