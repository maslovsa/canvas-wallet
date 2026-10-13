import { describe, it, expect } from "vitest";
import {
  SendController,
  deriveSendView,
  initialState,
  formatDisplay,
  getSendController,
  resetSendSession,
  SPINNER_DELAY_MS,
  SOFT_TIMEOUT_MS,
  SENDING_MS,
  type SendDeps,
  type SendTokenInfo,
} from "../src/send/send-session.ts";
import type { RiskResult } from "../src/send/risk-client.ts";
import type { FeeEstimate } from "../src/send/tron-fee.ts";
import { validateTronAddress } from "../src/send/tron-address.ts";
import { webcrypto } from "node:crypto";

const CLEAR_LABELED = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9";
const CLEAR_PLAIN = "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe";
const RISKY = "THJUJFyTnrBWb1ijWav7qfRBrjUuKgP49Z";
const UNKNOWN = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";

const USDT: SendTokenInfo = {
  key: "Tron:TR7NHq",
  symbol: "USDT",
  name: "Tether USD",
  decimals: 6,
  isNative: false,
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  balanceUnits: 120_000_000n,
  trxBalanceUnits: 250_000_000n,
};
const TRX: SendTokenInfo = { ...USDT, key: "Tron:native", symbol: "TRX", name: "Tron", isNative: true, contract: "native", balanceUnits: 100_000_000n };

/** A hand-driven clock: timers fire only when the test advances time. */
class Clock {
  t = 0;
  private timers: Array<{ at: number; fn: () => void; id: number }> = [];
  private n = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.n;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== id);
  };
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  }
}

const LIVE_FEE: FeeEstimate = { kind: "live", newRecipient: false, sun: 6_400_000n };
const SEED: Record<string, RiskResult> = {
  [CLEAR_LABELED]: { state: "clear", label: "Binance" },
  [CLEAR_PLAIN]: { state: "clear" },
  [RISKY]: { state: "caution" },
};

function setup(overrides: Partial<SendDeps> = {}, token = USDT) {
  const clock = new Clock();
  const feeCalls: string[] = [];
  const deps: SendDeps = {
    validateAddress: (a) => validateTronAddress(a, webcrypto.subtle as SubtleCrypto),
    estimateFee: async (_t, recipient) => {
      feeCalls.push(recipient);
      return LIVE_FEE;
    },
    checkRisk: async (a) => SEED[a] ?? { state: "unavailable" },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    ...overrides,
  };
  const c = new SendController(token, deps);
  return { c, clock, feeCalls };
}
const settle = () => new Promise((r) => setTimeout(r, 25)); // real WebCrypto digests resolve off the microtask queue

describe("address -> risk status", () => {
  it("a labeled clear address shows the owner label with a check; the fee estimate is requested once", async () => {
    const { c, feeCalls } = setup();
    await c.setAddress(CLEAR_LABELED);
    await settle();
    const v = c.view();
    expect(v.address.status).toEqual({ tone: "success", icon: "check", text: "Binance", spinner: false, checkAgain: false, owner: { logo: null } });
    expect(feeCalls).toEqual([CLEAR_LABELED]);
    expect(v.fee).toEqual({ label: "Network fee (estimate)", value: "~6.4 TRX", note: null });
  });

  it("clear without a label is neutral wording, never 'Safe'", async () => {
    const { c } = setup();
    await c.setAddress(CLEAR_PLAIN);
    await settle();
    expect(c.view().address.status).toMatchObject({ tone: "dim", text: "No risk signals found", icon: "none" });
  });

  it("caution shows the amber line first and does NOT open the popup", async () => {
    const { c } = setup();
    await c.setAddress(RISKY);
    await settle();
    expect(c.view().address.status).toMatchObject({ tone: "caution", icon: "alert" });
    expect(c.view().popup).toBe(false);
  });

  it("an address nobody answered for is 'Couldn't verify' with Check again, and Check again can recover", async () => {
    let answer: RiskResult = { state: "unavailable" };
    const { c } = setup({ checkRisk: async () => answer });
    await c.setAddress(UNKNOWN);
    await settle();
    expect(c.view().address.status).toMatchObject({ text: "Couldn't verify this address.", checkAgain: true, icon: "help" });
    answer = { state: "clear" };
    c.checkAgain();
    await settle();
    expect(c.view().address.status).toMatchObject({ text: "No risk signals found" });
  });

  it("a thrown risk check becomes unavailable (never safe, never a crash)", async () => {
    const { c } = setup({ checkRisk: async () => { throw new Error("boom"); } });
    await c.setAddress(UNKNOWN);
    await settle();
    expect(c.view().address.status).toMatchObject({ checkAgain: true });
  });

  it("surrounding whitespace from a paste is trimmed before validation", async () => {
    const { c } = setup();
    await c.setAddress(`  ${CLEAR_PLAIN}\n`);
    await settle();
    expect(c.state.address).toBe(CLEAR_PLAIN);
    expect(c.state.addressStatus.kind).toBe("valid");
  });
});

describe("address validation messages", () => {
  it("no error while the address is still being typed, an error once it is wrong", async () => {
    const { c } = setup();
    await c.setAddress("TR7NHq");
    expect(c.view().address.error).toBeNull();
    await c.setAddress(CLEAR_PLAIN.slice(0, -1) + "j"); // 34 chars, bad checksum
    expect(c.view().address.error).toBe("Enter a valid Tron address");
    await c.setAddress("T0" + "A".repeat(10)); // illegal character
    expect(c.view().address.error).toBe("Enter a valid Tron address");
  });

  it("without WebCrypto the screen says so and Send stays disabled", async () => {
    const { c } = setup({ validateAddress: (a) => validateTronAddress(a, null) });
    await c.setAddress(CLEAR_PLAIN);
    expect(c.view().address.error).toBe("Can't verify addresses in this browser. Send is unavailable.");
    expect(c.view().button.enabled).toBe(false);
  });
});

describe("checking indicator and the 15 s ceiling", () => {
  function slowRisk() {
    let release!: (r: RiskResult) => void;
    const promise = new Promise<RiskResult>((resolve) => (release = resolve));
    return { promise, release };
  }

  it("shows no spinner before 250 ms, the spinner after, and Send waits for the verdict", async () => {
    const slow = slowRisk();
    const { c, clock } = setup({ checkRisk: () => slow.promise });
    c.setAmount("10");
    await c.setAddress(CLEAR_PLAIN);
    expect(c.view().address.status).toBeNull();
    clock.advance(SPINNER_DELAY_MS);
    expect(c.view().address.status).toMatchObject({ text: "Checking address…", spinner: true });
    expect(c.view().button).toMatchObject({ label: "Send", enabled: false, reason: "Checking address…" });
    slow.release({ state: "clear" });
    await settle();
    expect(c.view().button.enabled).toBe(true);
  });

  it("at 15 s the status visibly becomes 'Couldn't verify' and Send is enabled, not silently", async () => {
    const slow = slowRisk();
    const { c, clock } = setup({ checkRisk: () => slow.promise });
    c.setAmount("10");
    await c.setAddress(CLEAR_PLAIN);
    clock.advance(SOFT_TIMEOUT_MS - 1);
    expect(c.view().button.enabled).toBe(false);
    clock.advance(1);
    expect(c.view().address.status).toMatchObject({ text: "Couldn't verify this address.", checkAgain: true });
    expect(c.view().button.enabled).toBe(true);
  });
});

describe("stale replies (both completion orders)", () => {
  it("the old address's late reply never applies to the new address", async () => {
    const releases: Record<string, (r: RiskResult) => void> = {};
    const { c } = setup({ checkRisk: (a) => new Promise<RiskResult>((resolve) => (releases[a] = resolve)) });
    await c.setAddress(RISKY); // check A starts
    await c.setAddress(CLEAR_PLAIN); // edit to B: check B starts
    // order 1: A answers first (stale), then B
    releases[RISKY]!({ state: "caution" });
    await settle();
    expect(c.state.risk.kind).toBe("checking");
    releases[CLEAR_PLAIN]!({ state: "clear" });
    await settle();
    expect(c.state.risk).toEqual({ kind: "clear" });
  });

  it("order 2: B answers first, A's late reply is dropped", async () => {
    const releases: Record<string, (r: RiskResult) => void> = {};
    const { c } = setup({ checkRisk: (a) => new Promise<RiskResult>((resolve) => (releases[a] = resolve)) });
    await c.setAddress(RISKY);
    await c.setAddress(CLEAR_PLAIN);
    releases[CLEAR_PLAIN]!({ state: "clear" });
    await settle();
    releases[RISKY]!({ state: "caution" });
    await settle();
    expect(c.state.risk).toEqual({ kind: "clear" });
    expect(c.state.address).toBe(CLEAR_PLAIN);
  });

  it("editing the address resets the status and the popup", async () => {
    const { c } = setup();
    c.setAmount("10");
    await c.setAddress(RISKY);
    await settle();
    c.pressSend();
    expect(c.view().popup).toBe(true);
    await c.setAddress(RISKY.slice(0, 20));
    expect(c.state.risk.kind).toBe("idle");
    expect(c.view().popup).toBe(false);
  });
});

describe("Send, popup, sending, sent", () => {
  async function ready(address: string) {
    const ctx = setup();
    ctx.c.setAmount("25.5");
    await ctx.c.setAddress(address);
    await settle();
    return ctx;
  }

  it("clear: Send goes straight to Sending, then Sent (simulated) after 600 ms", async () => {
    const { c, clock } = await ready(CLEAR_LABELED);
    c.pressSend();
    expect(c.view().phase).toBe("sending");
    expect(c.view().button).toMatchObject({ label: "Sending…", enabled: false });
    expect(c.view().backEnabled).toBe(false);
    clock.advance(SENDING_MS);
    expect(c.view().phase).toBe("sent");
    expect(c.view().sent).toEqual({
      headline: "25.5 USDT sent",
      address: CLEAR_LABELED,
      feeLine: "Network fee ~6.4 TRX",
      pill: "Simulated — no transaction was sent",
    });
    expect(c.view().backEnabled).toBe(true);
  });

  it("a double press submits once", async () => {
    const { c, clock } = await ready(CLEAR_PLAIN);
    c.pressSend();
    c.pressSend();
    clock.advance(SENDING_MS);
    expect(c.view().phase).toBe("sent");
  });

  it("caution: Send opens the popup; Cancel keeps address and amount and asks for focus on the address", async () => {
    const { c } = await ready(RISKY);
    c.pressSend();
    expect(c.view().popup).toBe(true);
    expect(c.view().phase).toBe("form");
    c.popupCancel();
    expect(c.view().popup).toBe(false);
    expect(c.state.address).toBe(RISKY);
    expect(c.state.amountText).toBe("25.5");
    expect(c.state.focusAddressRequests).toBe(1);
  });

  it("caution: Continue goes straight to Sending with no second confirmation", async () => {
    const { c, clock } = await ready(RISKY);
    c.pressSend();
    c.popupSendAnyway();
    expect(c.view().phase).toBe("sending");
    clock.advance(SENDING_MS);
    expect(c.view().phase).toBe("sent");
  });

  it("unavailable: Send is allowed (R5) without a popup", async () => {
    const { c } = await ready(UNKNOWN);
    expect(c.view().button.enabled).toBe(true);
    c.pressSend();
    expect(c.view().popup).toBe(false);
    expect(c.view().phase).toBe("sending");
  });

  it("the reason line never repeats an error that is already shown inline", async () => {
    const { c } = setup();
    await c.setAddress(CLEAR_PLAIN);
    await settle();
    c.setAmount("500"); // over the balance
    expect(c.view().amount.error).toBe("Not enough USDT");
    expect(c.view().button).toMatchObject({ enabled: false, reason: null });
    await c.setAddress(CLEAR_PLAIN.slice(0, -1) + "j"); // bad checksum
    expect(c.view().address.error).toBe("Enter a valid Tron address");
    expect(c.view().button.reason).toBeNull();
  });

  it("a disabled Send is ignored and always has a reason", async () => {
    const { c } = setup();
    c.pressSend();
    expect(c.view().phase).toBe("form");
    expect(c.view().button.reason).toBe("Enter an address");
  });
});

describe("amount and fee states (DR5)", () => {
  const view = (patch: Partial<ReturnType<typeof initialState>>, token = USDT) =>
    deriveSendView({ ...initialState(), addressStatus: { kind: "valid" }, address: CLEAR_PLAIN, risk: { kind: "clear" }, ...patch }, token, 0);

  it("empty, zero, malformed, too many decimals", () => {
    expect(view({ amountText: "" }).button).toMatchObject({ enabled: false, reason: "Enter an amount" });
    expect(view({ amountText: "0" }).amount.error).toBe("Amount must be more than 0");
    expect(view({ amountText: "abc" }).amount.error).toBe("Enter a valid amount");
    expect(view({ amountText: "1.1234567" }).amount.error).toBe("Too many decimals (max 6)");
  });

  it("more than the balance: 'Not enough USDT'", () => {
    expect(view({ amountText: "120.000001" }).amount.error).toBe("Not enough USDT");
    expect(view({ amountText: "120" }).amount.error).toBeNull();
  });

  it("a token send needs TRX for the fee", () => {
    const poor = { ...USDT, trxBalanceUnits: 1_000_000n };
    expect(view({ amountText: "10" }, poor).amount.error).toBe("Not enough TRX for the network fee");
  });

  it("a native send needs amount + fee", () => {
    expect(view({ amountText: "99" }, TRX).amount.error).toBe("Not enough TRX for the amount and the network fee");
    expect(view({ amountText: "90" }, TRX).amount.error).toBeNull();
  });

  it("fee line: loading dots, typical label on fallback, new-account note", () => {
    const typical: FeeEstimate = { kind: "typical", newRecipient: false, sun: 6_500_000n };
    expect(view({ fee: { kind: "loading", estimate: typical } }).fee).toEqual({ label: "Network fee (estimate)", value: "…", note: null });
    expect(view({ fee: { kind: "ready", estimate: typical } }).fee).toEqual({ label: "Network fee (typical)", value: "~6.5 TRX", note: null });
    expect(view({ fee: { kind: "ready", estimate: { kind: "live", newRecipient: true, sun: 13_000_000n } } }).fee.note).toBe("new account");
    expect(view({}).fee.value).toBe("—");
  });

  it("Max: the whole balance for a token, balance minus fee for TRX", async () => {
    const t = setup();
    t.c.pressMax();
    expect(t.c.state.amountText).toBe("120");
    const n = setup({}, TRX);
    n.c.pressMax();
    expect(n.c.state.amountText).toBe("93.5"); // 100 TRX - typical 6.5 TRX fee (no address yet)
  });

  it("formatDisplay: thousands separators and two decimals", () => {
    expect(formatDisplay(120_000_000n, 6)).toBe("120.00");
    expect(formatDisplay(1_234_567_890_000n, 6)).toBe("1,234,567.89");
  });
});

describe("module-scope session", () => {
  it("is reused for the same token across renders and replaced for another token", () => {
    resetSendSession();
    const deps = setup().c["deps"];
    const a = getSendController(USDT, deps);
    expect(getSendController(USDT, deps)).toBe(a);
    const b = getSendController({ ...USDT, key: "Tron:other" }, deps);
    expect(b).not.toBe(a);
    expect(b.state.address).toBe("");
    resetSendSession();
  });
});
