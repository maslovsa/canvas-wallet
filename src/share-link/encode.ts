import type { Token, RegistrySource } from "../types.ts";

// Fragment payload: JSON-stringified, then compressed via the browser-native
// CompressionStream('deflate') API (falling back to uncompressed base64url
// if unsupported — no hand-rolled compression code), base64url-encoded into
// the URL fragment (#c=<encoded>). Above ~2000 chars, callers should use the
// clipboard-copy fallback instead of a link (see share-link/build-link.ts).
//
// Includes `registrySource` alongside the token — CEO review Outside Voice
// (eng-review tension): once Studio is a generic multi-registry client, a
// share-link that omits which registry a config came from can silently
// misrepresent context if opened against a different default registry than
// the author had loaded. Encoding the source explicitly closes that gap.
export interface SharePayload {
  token: Token;
  registrySource: RegistrySource;
}

const MAX_FRAGMENT_LENGTH = 2000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function compress(text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") {
    return encoded; // Uncompressed fallback — still base64url-encoded below.
  }
  const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

export interface EncodeResult {
  fragment: string | null; // null if it exceeds MAX_FRAGMENT_LENGTH — caller should offer clipboard-copy instead.
  json: string; // Always available for the clipboard-copy fallback.
}

export async function encodeSharePayload(payload: SharePayload): Promise<EncodeResult> {
  const json = JSON.stringify(payload);
  const compressed = await compress(json);
  const encoded = toBase64Url(compressed);
  const fragment = `c=${encoded}`;
  return {
    fragment: fragment.length <= MAX_FRAGMENT_LENGTH ? fragment : null,
    json,
  };
}
