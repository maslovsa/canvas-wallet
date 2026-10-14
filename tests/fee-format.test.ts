import { describe, it, expect } from "vitest";
import { formatFeeAmount } from "../src/send/fee.ts";

describe("formatFeeAmount", () => {
  it("one decimal from 1 up, rounded half up", () => {
    expect(formatFeeAmount(6_500_000n, 6)).toBe("6.5");
    expect(formatFeeAmount(6_449_999n, 6)).toBe("6.4");
    expect(formatFeeAmount(6_450_000n, 6)).toBe("6.5");
    expect(formatFeeAmount(13_000_000n, 6)).toBe("13.0");
    expect(formatFeeAmount(1_000_000_000_000_000_000n, 18)).toBe("1.0");
  });
  it("two significant digits below 1, trailing zeros dropped", () => {
    expect(formatFeeAmount(345_000n, 6)).toBe("0.35"); // was "0.3" with Tron's one-decimal rule: more precision is fine
    expect(formatFeeAmount(300_000n, 6)).toBe("0.3");
    expect(formatFeeAmount(550_000n, 9)).toBe("0.00055");
    expect(formatFeeAmount(31_200_000_000_000n, 18)).toBe("0.000031");
    expect(formatFeeAmount(6_500_000_000_000n, 18)).toBe("0.0000065");
    expect(formatFeeAmount(5_500_000n, 9)).toBe("0.0055");
    expect(formatFeeAmount(1n, 9)).toBe("0.000000001");
    expect(formatFeeAmount(998_000n, 6)).toBe("1.0");
    expect(formatFeeAmount(0n, 6)).toBe("0.0");
  });
});
