import type { SharePayload } from "./encode.ts";
import { parseToken } from "../schema-validator.ts";

// Broken/truncated fragment -> explicit error state (CEO review Section 11
// finding), never a blank page or crash.
export class ShareLinkDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareLinkDecodeError";
  }
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decompress(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    return new TextDecoder().decode(bytes);
  }
  try {
    const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream("deflate"));
    const decompressed = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(decompressed);
  } catch {
    // Wasn't actually compressed (encoder's CompressionStream was unsupported
    // at share time) — treat the raw bytes as the plain-text fallback.
    return new TextDecoder().decode(bytes);
  }
}

export async function decodeShareFragment(fragment: string): Promise<SharePayload> {
  const match = /^c=(.+)$/.exec(fragment);
  if (!match) {
    throw new ShareLinkDecodeError("This preview link appears broken or truncated.");
  }
  let json: string;
  try {
    const bytes = fromBase64Url(match[1]!);
    json = await decompress(bytes);
  } catch {
    throw new ShareLinkDecodeError("This preview link appears broken or truncated.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ShareLinkDecodeError("This preview link appears broken or truncated.");
  }

  const obj = raw as Partial<SharePayload>;
  if (!obj.token || !obj.registrySource) {
    throw new ShareLinkDecodeError("This preview link appears broken or truncated.");
  }
  // Re-validate the embedded token against the schema — a share link is
  // untrusted input just like a fetched registry file.
  const token = parseToken(JSON.stringify(obj.token));
  return { token, registrySource: obj.registrySource };
}
