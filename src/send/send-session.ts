// State machine and view model for the Send screen. Two rules shape this file:
//  1. The phone re-renders by wiping its container (phone-frame.ts: `container.innerHTML = ""`), so the
//     session lives HERE, at module scope, keyed by network + token, and the DOM is rebuilt from it.
//  2. Everything the screen shows comes from the pure `deriveSendView(state, token, now)`; the controller
//     only moves the state (address -> validation -> risk check + fee estimate -> Send).
// Plan decisions: DR1-DR14 (design review), R5/E6/E7 (risk states), R10 (15 s ceiling).
import { StaleFetchGuard } from "../registry-client/stale-fetch-guard.ts";
import { validateTronAddress, type TronAddressCheck } from "./tron-address.ts";
import { estimateFee, formatTrx, type FeeEstimate } from "./tron-fee.ts";
import { checkAddress, loadSeed, type RiskResult } from "./risk-client.ts";
import { parseAmount, maxSendable, formatUnits } from "./send-input.ts";

export const SPINNER_DELAY_MS = 250;
export const SOFT_TIMEOUT_MS = 15_000;
/** "Check again" waits this long after the previous check started: a button must not be able to hammer the risk API. */
export const CHECK_AGAIN_COOLDOWN_MS = 10_000;
export const SENDING_MS = 600;

export interface SendTokenInfo {
  /** `${network}:${token.id}` — a different key means a fresh session (no leaking an address between tokens). */
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  /** Contract address for a TRC20 token, "native" for TRX. */
  contract: string;
  /** Illustrative balance of this token (same fake balance the wallet-home screen shows), in base units. */
  balanceUnits: bigint;
  /** Illustrative TRX balance, used to check that the network fee can be paid. */
  trxBalanceUnits: bigint;
}

type AddressStatus = { kind: "empty" } | { kind: "pending" } | { kind: "invalid"; reason: Exclude<TronAddressCheck, { ok: true }>["reason"] } | { kind: "valid" };
type RiskUi = { kind: "idle" } | { kind: "checking"; startedAt: number } | { kind: "clear"; label?: string; logo?: string } | { kind: "caution"; label?: string; logo?: string } | { kind: "unavailable" };
type FeeUi = { kind: "none" } | { kind: "loading"; estimate: FeeEstimate } | { kind: "ready"; estimate: FeeEstimate };

export interface SendState {
  address: string;
  amountText: string;
  addressStatus: AddressStatus;
  risk: RiskUi;
  fee: FeeUi;
  phase: "form" | "sending" | "sent";
  popupOpen: boolean;
  /** Counter the screen watches: each increment means "put the cursor back in the address field". */
  focusAddressRequests: number;
  /** When the last risk check started (ms); drives the Check again cooldown. */
  lastCheckAt: number | null;
  sent: { amountText: string; address: string; feeText: string } | null;
}

export function initialState(): SendState {
  return {
    address: "",
    amountText: "",
    addressStatus: { kind: "empty" },
    risk: { kind: "idle" },
    fee: { kind: "none" },
    phase: "form",
    popupOpen: false,
    focusAddressRequests: 0,
    lastCheckAt: null,
    sent: null,
  };
}

// ---------------------------------------------------------------- view model

export type Tone = "success" | "caution" | "dim" | "error";

export interface SendView {
  title: string;
  address: {
    value: string;
    error: string | null;
    status: {
      tone: Tone;
      icon: "check" | "alert" | "help" | "none";
      text: string;
      spinner: boolean;
      checkAgain: boolean;
      /** Seconds until Check again can be pressed (0 = ready); the button is disabled meanwhile. */
      checkAgainWaitSec: number;
      /** Set when the text is the owner's (VASP's) name: the screen shows its logo, or an initial when there is none. */
      owner: { logo: string | null } | null;
      /** On a risky address that is a known VASP: its name and logo are shown on a row above the risk line. */
      identity: { name: string; logo: string | null } | null;
    } | null;
  };
  amount: { value: string; error: string | null; balanceText: string };
  fee: { label: string; value: string; note: string | null };
  button: { label: string; enabled: boolean; reason: string | null };
  backEnabled: boolean;
  popup: boolean;
  sent: { headline: string; address: string; feeLine: string; pill: string } | null;
  phase: SendState["phase"];
}

const TYPICAL_EXISTING_SUN = 6_500_000n; // used for balance checks before an address (and so a real estimate) exists

export function currentFee(state: SendState): FeeEstimate | null {
  return state.fee.kind === "none" ? null : state.fee.estimate;
}

function amountIssue(state: SendState, token: SendTokenInfo): { error: string | null; units: bigint | null; empty: boolean } {
  const parsed = parseAmount(state.amountText, token.decimals);
  if (!parsed.ok) {
    const messages = {
      empty: null,
      format: "Enter a valid amount",
      too_many_decimals: `Too many decimals (max ${token.decimals})`,
      zero: "Amount must be more than 0",
      too_large: "Amount is too large",
    } as const;
    return { error: messages[parsed.reason], units: null, empty: parsed.reason === "empty" };
  }
  const feeSun = currentFee(state)?.sun ?? TYPICAL_EXISTING_SUN;
  if (parsed.units > token.balanceUnits) return { error: `Not enough ${token.symbol}`, units: null, empty: false };
  if (token.isNative && parsed.units + feeSun > token.balanceUnits) {
    return { error: "Not enough TRX for the amount and the network fee", units: null, empty: false };
  }
  if (!token.isNative && feeSun > token.trxBalanceUnits) {
    return { error: "Not enough TRX for the network fee", units: null, empty: false };
  }
  return { error: null, units: parsed.units, empty: false };
}

function cooldownSec(state: SendState, nowMs: number): number {
  if (state.lastCheckAt === null) return 0;
  const left = state.lastCheckAt + CHECK_AGAIN_COOLDOWN_MS - nowMs;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function addressView(state: SendState, nowMs: number): SendView["address"]["status"] {
  const { risk } = state;
  switch (state.addressStatus.kind) {
    case "empty":
    case "pending":
    case "invalid":
      return null;
    case "valid":
      break;
  }
  if (risk.kind === "checking") {
    const slow = nowMs - risk.startedAt >= SPINNER_DELAY_MS; // no flicker for a sub-250 ms check (DR7)
    return slow ? { tone: "dim", icon: "none", text: "Checking address…", spinner: true, checkAgain: false, checkAgainWaitSec: 0, owner: null, identity: null } : null;
  }
  if (risk.kind === "clear") {
    return risk.label
      ? { tone: "success", icon: "check", text: risk.label, spinner: false, checkAgain: false, checkAgainWaitSec: 0, owner: { logo: risk.logo ?? null }, identity: null }
      : { tone: "dim", icon: "none", text: "No risk signals found", spinner: false, checkAgain: false, checkAgainWaitSec: 0, owner: null, identity: null }; // never "Safe" (DR3)
  }
  if (risk.kind === "caution") {
    return {
      tone: "caution",
      icon: "alert",
      text: "Risk signals found for this address",
      spinner: false,
      checkAgain: false,
      checkAgainWaitSec: 0,
      owner: null,
      identity: risk.label ? { name: risk.label, logo: risk.logo ?? null } : null,
    };
  }
  if (risk.kind === "unavailable") {
    return { tone: "dim", icon: "help", text: "Couldn't verify this address.", spinner: false, checkAgain: true, checkAgainWaitSec: cooldownSec(state, nowMs), owner: null, identity: null };
  }
  return null;
}

function addressError(state: SendState): string | null {
  const s = state.addressStatus;
  if (s.kind !== "invalid") return null;
  if (s.reason === "no_crypto") return "Can't verify addresses in this browser. Send is unavailable.";
  // Still typing a valid-looking prefix: stay quiet. An illegal character is wrong at any length.
  if (s.reason === "length" && state.address.length < 34 && /^[1-9A-HJ-NP-Za-km-z]*$/.test(state.address)) return null;
  return "Enter a valid Tron address";
}

function feeView(state: SendState): SendView["fee"] {
  if (state.fee.kind === "none") return { label: "Network fee (estimate)", value: "—", note: null };
  const { estimate } = state.fee;
  const label = state.fee.kind === "loading" ? "Network fee (estimate)" : estimate.kind === "live" ? "Network fee (estimate)" : "Network fee (typical)";
  const value = state.fee.kind === "loading" ? "…" : `~${formatTrx(estimate.sun)} TRX`;
  return { label, value, note: state.fee.kind === "ready" && estimate.newRecipient ? "new account" : null };
}

export function deriveSendView(state: SendState, token: SendTokenInfo, nowMs: number): SendView {
  const amount = amountIssue(state, token);
  const addrOk = state.addressStatus.kind === "valid";
  const checking = state.risk.kind === "checking" || state.risk.kind === "idle";

  let reason: string | null = null;
  if (state.addressStatus.kind === "empty") reason = "Enter an address";
  else if (state.addressStatus.kind === "pending") reason = "Checking address…";
  else if (!addrOk) reason = addressError(state) ?? "Enter a valid Tron address";
  else if (checking) reason = "Checking address…";
  else if (amount.empty) reason = "Enter an amount";
  else if (amount.error) reason = amount.error;

  const enabled = state.phase === "form" && reason === null && amount.units !== null;
  const feeLine = feeView(state);

  return {
    title: `Send ${token.symbol}`,
    address: {
      value: state.address,
      error: addressError(state),
      status: addressView(state, nowMs),
    },
    amount: { value: state.amountText, error: amount.error, balanceText: `Balance ${formatDisplay(token.balanceUnits, token.decimals)} ${token.symbol}` },
    fee: feeLine,
    // The line above the button explains a disabled Send, but never repeats an error already shown inline
    // right under its field (design review: "Not enough USDT" appeared twice on one screen).
    button: { label: state.phase === "sending" ? "Sending…" : "Send", enabled, reason: enabled || state.phase !== "form" || reason === amount.error || reason === addressError(state) ? null : reason },
    backEnabled: state.phase !== "sending",
    popup: state.popupOpen,
    sent: state.sent
      ? {
          headline: `${state.sent.amountText} ${token.symbol} sent`,
          address: state.sent.address,
          feeLine: state.sent.feeText,
          pill: "Simulated — no transaction was sent",
        }
      : null,
    phase: state.phase,
  };
}

/** Balance text with at most 2 decimals, e.g. 120_000_000n @6 -> "120.00". */
export function formatDisplay(units: bigint, decimals: number): string {
  const full = formatUnits(units, decimals);
  const [whole = "0", frac = ""] = full.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

// ---------------------------------------------------------------- controller

export interface SendDeps {
  validateAddress: (address: string) => Promise<TronAddressCheck>;
  estimateFee: (token: SendTokenInfo, recipient: string) => Promise<FeeEstimate>;
  checkRisk: (address: string) => Promise<RiskResult>;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export function defaultSendDeps(): SendDeps {
  return {
    validateAddress: (address) => validateTronAddress(address),
    estimateFee: (token, recipient) => estimateFee({ type: token.isNative ? "NATIVE" : "TRC20", id: token.contract }, recipient),
    checkRisk: async (address) => checkAddress(address, { seed: await loadSeed(), now: new Date(), proxyUrl: import.meta.env.VITE_RISK_PROXY_URL }),
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

export class SendController {
  state: SendState = initialState();
  private listeners = new Set<() => void>();
  private guard = new StaleFetchGuard();
  private timers = new Set<unknown>();

  constructor(
    readonly token: SendTokenInfo,
    private deps: SendDeps,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  view(): SendView {
    return deriveSendView(this.state, this.token, this.deps.now());
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  private later(fn: () => void, ms: number): void {
    const handle = this.deps.setTimeout(() => {
      this.timers.delete(handle);
      fn();
    }, ms);
    this.timers.add(handle);
  }

  private clearTimers(): void {
    for (const t of this.timers) this.deps.clearTimeout(t);
    this.timers.clear();
  }

  /** Typing or pasting. Surrounding whitespace is trimmed here (the validator itself is strict). */
  async setAddress(raw: string): Promise<void> {
    const text = raw.trim();
    const token = this.guard.begin();
    this.clearTimers();
    Object.assign(this.state, { address: text, risk: { kind: "idle" }, fee: { kind: "none" }, popupOpen: false } satisfies Partial<SendState>);
    // Never keep the previous address's verdict on screen while this one is being validated.
    this.state.addressStatus = text === "" ? { kind: "empty" } : { kind: "pending" };
    if (text === "") {
      this.state.addressStatus = { kind: "empty" };
      this.emit();
      return;
    }
    const check = await this.deps.validateAddress(text);
    if (!this.guard.isCurrent(token)) return; // the field changed while validating
    if (!check.ok) {
      this.state.addressStatus = { kind: "invalid", reason: check.reason };
      this.emit();
      return;
    }
    this.state.addressStatus = { kind: "valid" };
    this.runChecks(token, text);
  }

  private runChecks(token: symbol, address: string): void {
    const startedAt = this.deps.now();
    this.state.lastCheckAt = startedAt;
    this.state.risk = { kind: "checking", startedAt };
    if (this.state.fee.kind === "none") {
      // Show a typical figure immediately; the live estimate replaces it when TronGrid answers.
      this.state.fee = { kind: "loading", estimate: { kind: "typical", newRecipient: false, sun: TYPICAL_EXISTING_SUN } };
      void this.deps.estimateFee(this.token, address).then((estimate) => {
        if (!this.guard.isCurrent(token)) return;
        this.state.fee = { kind: "ready", estimate };
        this.emit();
      });
    }
    this.emit();
    this.later(() => this.emit(), SPINNER_DELAY_MS); // reveal the spinner only if the check is still running
    this.later(() => {
      if (this.guard.isCurrent(token) && this.state.risk.kind === "checking") {
        this.state.risk = { kind: "unavailable" }; // 15 s ceiling (R10): visibly "couldn't verify", never silently enabled
        this.emit();
        this.tickCooldown();
      }
    }, SOFT_TIMEOUT_MS);
    void this.deps
      .checkRisk(address)
      .catch((): RiskResult => ({ state: "unavailable" }))
      .then((result) => {
        if (!this.guard.isCurrent(token)) return; // stale reply for an address no longer in the field
        this.state.risk =
          result.state === "clear" || result.state === "caution"
            ? result.label
              ? result.logo
                ? { kind: result.state, label: result.label, logo: result.logo }
                : { kind: result.state, label: result.label }
              : { kind: result.state }
            : { kind: result.state };
        this.emit();
        this.tickCooldown();
      });
  }

  /** While Check again is cooling down, re-render once a second so its countdown moves and it re-enables on time. */
  private tickCooldown(): void {
    if (this.state.risk.kind !== "unavailable" || cooldownSec(this.state, this.deps.now()) === 0) return;
    this.later(() => {
      this.emit();
      this.tickCooldown();
    }, 1000);
  }

  /** "Check again" after a failed check: same address, same guard rules. */
  checkAgain(): void {
    if (this.state.addressStatus.kind !== "valid" || this.state.risk.kind === "checking") return;
    if (cooldownSec(this.state, this.deps.now()) > 0) return; // throttled: presses inside the cooldown do nothing
    const token = this.guard.begin();
    this.clearTimers();
    this.runChecks(token, this.state.address);
  }

  setAmount(text: string): void {
    this.state.amountText = text;
    this.emit();
  }

  pressMax(): void {
    const fee = currentFee(this.state)?.sun ?? TYPICAL_EXISTING_SUN;
    this.state.amountText = formatUnits(maxSendable(this.token.balanceUnits, fee, this.token.isNative), this.token.decimals);
    this.emit();
  }

  pressSend(): void {
    if (!this.view().button.enabled) return;
    if (this.state.risk.kind === "caution") {
      this.state.popupOpen = true; // the popup opens on Send only, never on a verdict (DR2)
      this.emit();
      return;
    }
    this.startSending();
  }

  popupCancel(): void {
    this.state.popupOpen = false;
    this.state.focusAddressRequests += 1; // data stays; the cursor goes back to the address (DR8)
    this.emit();
  }

  popupSendAnyway(): void {
    this.state.popupOpen = false;
    this.startSending();
  }

  private startSending(): void {
    if (this.state.phase !== "form") return; // double click: exactly one confirmation
    const fee = currentFee(this.state);
    this.state.phase = "sending";
    this.state.sent = {
      amountText: this.state.amountText.trim(),
      address: this.state.address,
      feeText: fee ? `Network fee ~${formatTrx(fee.sun)} TRX` : "Network fee —",
    };
    this.emit();
    this.later(() => {
      this.state.phase = "sent";
      this.emit();
    }, SENDING_MS);
  }

  dispose(): void {
    this.guard.begin(); // invalidate every in-flight reply
    this.clearTimers();
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------- module-scope session

let current: SendController | null = null;

/** The session for this token: reused across phone re-renders, replaced (and the old one disposed) when the token changes. */
export function getSendController(token: SendTokenInfo, deps: SendDeps = defaultSendDeps()): SendController {
  if (current && current.token.key === token.key) return current;
  current?.dispose();
  current = new SendController(token, deps);
  return current;
}

export function resetSendSession(): void {
  current?.dispose();
  current = null;
}
