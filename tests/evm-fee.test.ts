import { describe, it, expect } from "vitest";
import { estimateEvmFee, typicalEvmFee, EVM_FEE_CHAINS } from "../src/send/evm-fee.ts";
import { estimateTonFee } from "../src/send/ton-fee.ts";

const rpc = (result: unknown, ok = true) => (async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: ok ? 200 : 500 })) as unknown as typeof fetch;
const TOKEN = { type: "ERC20", id: "0xdAC17F958D2ee523a2206206994597C13D831ec7" };
const NATIVE = { type: "NATIVE", id: "native" };

describe("estimateEvmFee", () => {
  it("is the live gas price times 21,000 gas for a native transfer and 65,000 for a token", async () => {
    const fetchImpl = rpc("0x3b9aca00"); // 1 gwei
    expect(await estimateEvmFee(EVM_FEE_CHAINS.ETH, NATIVE, fetchImpl)).toEqual({ kind: "live", newRecipient: false, units: 21_000_000_000_000n });
    expect(await estimateEvmFee(EVM_FEE_CHAINS.ETH, TOKEN, fetchImpl)).toEqual({ kind: "live", newRecipient: false, units: 65_000_000_000_000n });
  });

  it("falls back to the typical figure, flagged typical, on any failure or a nonsense answer", async () => {
    const typical = typicalEvmFee(EVM_FEE_CHAINS.BSC, TOKEN);
    expect(typical).toEqual({ kind: "typical", newRecipient: false, units: 65_000n * 100_000_000n });
    for (const f of [rpc("0x1", false), rpc("nope"), rpc("0x0"), rpc(undefined), (async () => { throw new Error("offline"); }) as unknown as typeof fetch]) {
      expect(await estimateEvmFee(EVM_FEE_CHAINS.BSC, TOKEN, f)).toEqual(typical);
    }
  });
});

describe("estimateTonFee", () => {
  it("is a typical figure: about 0.0055 GRAM native and 0.04 for a jetton", async () => {
    expect(await estimateTonFee(NATIVE)).toEqual({ kind: "typical", newRecipient: false, units: 5_500_000n });
    expect(await estimateTonFee({ type: "JETTON", id: "x" })).toEqual({ kind: "typical", newRecipient: false, units: 40_000_000n });
  });
});
