import { describe, it, expect, beforeEach } from "vitest";
import { estimateFee, formatTrx, resetFeeCache } from "../src/send/tron-fee.ts";

const USDT = { type: "TRC20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" };
const TRX = { type: "NATIVE", id: "native" };
const HOLDER = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9";
const EMPTY = "TPyE2oSoaysrXfLzwf9wetBVr9JudLwjtD";

const PARAMS = {
  chainParameter: [
    { key: "getEnergyFee", value: 100 },
    { key: "getTransactionFee", value: 1000 },
    { key: "getCreateNewAccountFeeInSystemContract", value: 1_000_000 },
  ],
};

interface Calls { urls: string[] }
function fakeTronGrid(opts: { holderBalanceWord?: string; accountExists?: boolean; failParams?: boolean; failCalls?: boolean }): { fetchImpl: typeof fetch; calls: Calls } {
  const calls: Calls = { urls: [] };
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.urls.push(url);
    if (url.endsWith("/getchainparameters")) {
      if (opts.failParams) return new Response("", { status: 503 });
      return new Response(JSON.stringify(PARAMS));
    }
    if (opts.failCalls) return new Response("", { status: 429 });
    if (url.endsWith("/triggerconstantcontract")) {
      const body = JSON.parse(String(init?.body));
      expect(body.function_selector).toBe("balanceOf(address)");
      expect(body.parameter).toHaveLength(64);
      return new Response(JSON.stringify({ constant_result: [opts.holderBalanceWord ?? "0".repeat(64)] }));
    }
    if (url.endsWith("/getaccount")) return new Response(JSON.stringify(opts.accountExists ? { address: "x", balance: 1 } : {}));
    throw new Error("unexpected url " + url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("estimateFee", () => {
  beforeEach(resetFeeCache);

  it("TRC20 to an address that already holds the token: ~65k energy x 100 SUN = 6.5 TRX, live", async () => {
    const { fetchImpl } = fakeTronGrid({ holderBalanceWord: "0".repeat(63) + "1" });
    const fee = await estimateFee(USDT, HOLDER, fetchImpl);
    expect(fee).toEqual({ kind: "live", newRecipient: false, sun: 6_500_000n });
    expect(formatTrx(fee.sun)).toBe("6.5");
  });

  it("TRC20 to an empty address: ~130k energy = 13.0 TRX, flagged as a new recipient", async () => {
    const { fetchImpl } = fakeTronGrid({});
    const fee = await estimateFee(USDT, EMPTY, fetchImpl);
    expect(fee).toEqual({ kind: "live", newRecipient: true, sun: 13_000_000n });
  });

  it("native TRX to an existing account: bandwidth only (345 bytes x 1000 SUN)", async () => {
    const { fetchImpl } = fakeTronGrid({ accountExists: true });
    expect(await estimateFee(TRX, HOLDER, fetchImpl)).toEqual({ kind: "live", newRecipient: false, sun: 345_000n });
  });

  it("native TRX to an account that does not exist yet: + 1 TRX creation fee", async () => {
    const { fetchImpl } = fakeTronGrid({ accountExists: false });
    expect(await estimateFee(TRX, EMPTY, fetchImpl)).toEqual({ kind: "live", newRecipient: true, sun: 1_345_000n });
  });

  it("chain parameters are fetched once per session", async () => {
    const { fetchImpl, calls } = fakeTronGrid({});
    await estimateFee(USDT, HOLDER, fetchImpl);
    await estimateFee(USDT, EMPTY, fetchImpl);
    expect(calls.urls.filter((u) => u.endsWith("/getchainparameters"))).toHaveLength(1);
  });

  it("TronGrid down: typical figures, flagged 'typical', never zero", async () => {
    const { fetchImpl } = fakeTronGrid({ failParams: true });
    const fee = await estimateFee(USDT, HOLDER, fetchImpl);
    expect(fee.kind).toBe("typical");
    expect(fee.sun).toBe(6_500_000n);
  });

  it("rate limited on the recipient lookup (429): typical figures", async () => {
    const { fetchImpl } = fakeTronGrid({ failCalls: true });
    expect((await estimateFee(USDT, HOLDER, fetchImpl)).kind).toBe("typical");
  });

  it("a malformed parameters answer (missing getEnergyFee) falls back to typical", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ chainParameter: [{ key: "getTransactionFee", value: 1000 }] }))) as unknown as typeof fetch;
    expect((await estimateFee(USDT, HOLDER, fetchImpl)).kind).toBe("typical");
  });
});

describe("formatTrx", () => {
  it("rounds to one decimal using integer math", () => {
    expect(formatTrx(6_500_000n)).toBe("6.5");
    expect(formatTrx(6_449_999n)).toBe("6.4");
    expect(formatTrx(6_450_000n)).toBe("6.5");
    expect(formatTrx(345_000n)).toBe("0.3");
    expect(formatTrx(13_000_000n)).toBe("13.0");
    expect(formatTrx(0n)).toBe("0.0");
  });
});
