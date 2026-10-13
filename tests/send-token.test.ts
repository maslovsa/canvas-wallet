import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { prepareSend, toUnits, REFUSAL_NOT_TRON, REFUSAL_NO_CRYPTO } from "../src/send/send-token.ts";
import type { Token } from "../src/types.ts";

const subtle = webcrypto.subtle as SubtleCrypto;
const base = { name: "Tether USD", symbol: "USDT", decimals: 6, status: "active" as const };
const usdt: Token = { ...base, type: "TRC20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", tags: ["stablecoin"] };
const trx: Token = { name: "Tron", symbol: "TRX", type: "NATIVE", id: "native", decimals: 6, status: "active" };

describe("prepareSend", () => {
  it("opens for a Tron TRC20 token and for native TRX", async () => {
    const a = await prepareSend(usdt, "Tron", subtle);
    expect(a.ok && a.info).toMatchObject({ key: "Tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", isNative: false, contract: usdt.id, decimals: 6 });
    const b = await prepareSend(trx, "Tron", subtle);
    expect(b.ok && b.info).toMatchObject({ isNative: true, contract: "native" });
  });

  it("refuses any other network, explicitly", async () => {
    expect(await prepareSend(usdt, "Ethereum", subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
    expect(await prepareSend(usdt, undefined, subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
  });

  it("refuses token types it cannot handle (TRC10, ERC20...)", async () => {
    expect(await prepareSend({ ...usdt, type: "TRC10" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
    expect(await prepareSend({ ...usdt, type: "ERC20" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
  });

  it("refuses a TRC20 whose registry-controlled id is not a valid Tron address (no request is ever built from it)", async () => {
    expect(await prepareSend({ ...usdt, id: "not-an-address" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
    expect(await prepareSend({ ...usdt, id: usdt.id.slice(0, -1) + "j" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_NOT_TRON });
  });

  it("without WebCrypto it says so instead of skipping the check", async () => {
    expect(await prepareSend(usdt, "Tron", null)).toEqual({ ok: false, message: REFUSAL_NO_CRYPTO });
    // native TRX has no contract to validate
    expect((await prepareSend(trx, "Tron", null)).ok).toBe(true);
  });

  it("the illustrative balance is stable for a token and a token send gets the demo TRX balance", async () => {
    const a = await prepareSend(usdt, "Tron", subtle);
    const b = await prepareSend(usdt, "Tron", subtle);
    expect(a.ok && b.ok && a.info.balanceUnits === b.info.balanceUnits).toBe(true);
    expect(a.ok && a.info.trxBalanceUnits).toBe(250_000_000n);
  });
});

describe("toUnits", () => {
  it("keeps up to 6 decimals of the illustrative float and pads the rest", () => {
    expect(toUnits(120.5, 6)).toBe(120_500_000n);
    expect(toUnits(1.5, 18)).toBe(1_500_000n * 10n ** 12n);
    expect(toUnits(7.9, 0)).toBe(7n);
  });
});
