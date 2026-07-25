import { describe, it, expect } from "vitest";
import { encodeSharePayload } from "../src/share-link/encode.ts";
import { decodeShareFragment, ShareLinkDecodeError } from "../src/share-link/decode.ts";
import type { Token, RegistrySource } from "../src/types.ts";

const token: Token = {
  name: "T",
  symbol: "T",
  type: "ERC20",
  id: "0x1",
  decimals: 18,
  status: "active",
};

const source: RegistrySource = { kind: "github", owner: "acme", repo: "registry" };

describe("share-link encode/decode round trip", () => {
  it("round-trips a token and its registry source", async () => {
    const { fragment } = await encodeSharePayload({ token, registrySource: source });
    expect(fragment).not.toBeNull();
    const decoded = await decodeShareFragment(fragment!);
    expect(decoded.token.symbol).toBe("T");
    expect(decoded.registrySource).toEqual(source);
  });

  it("throws ShareLinkDecodeError on a broken/truncated fragment", async () => {
    await expect(decodeShareFragment("c=not-valid-base64url-!!!")).rejects.toThrow(ShareLinkDecodeError);
  });

  it("throws ShareLinkDecodeError on a fragment missing the c= prefix", async () => {
    await expect(decodeShareFragment("garbage")).rejects.toThrow(ShareLinkDecodeError);
  });

  it("falls back to a JSON payload (for clipboard copy) when the encoded fragment would be too long", async () => {
    // Repeated or periodic characters compress away to nothing under
    // deflate — use genuinely random bytes so compression can't shrink the
    // payload under the threshold, the way a real oversized config would.
    const randomBytes = crypto.getRandomValues(new Uint8Array(4000));
    const bigDescription = btoa(String.fromCharCode(...randomBytes));
    const bigToken: Token = { ...token, description: bigDescription };
    const { fragment, json } = await encodeSharePayload({ token: bigToken, registrySource: source });
    expect(fragment).toBeNull();
    expect(JSON.parse(json).token.description).toBe(bigDescription);
  });
});
