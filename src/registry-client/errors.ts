// One error class with a `code` discriminant rather than a subclass per
// error kind — the CEO review's error/rescue table names 5+ distinct
// failure modes, but a full subclass hierarchy for each was proposed and
// declined in the eng review (Section 2) as more ceremony than value here.
export type RegistryClientErrorCode =
  | "network_error"
  | "not_found"
  | "rate_limited"
  | "parse_error"
  | "schema_version_unrecognized";

export class RegistryClientError extends Error {
  readonly code: RegistryClientErrorCode;
  constructor(code: RegistryClientErrorCode, message: string) {
    super(message);
    this.name = "RegistryClientError";
    this.code = code;
  }
}

/** User-facing copy for each error code — one place to keep messages honest and consistent. */
export function userMessageFor(error: RegistryClientError): string {
  switch (error.code) {
    case "network_error":
      return "Couldn't reach the registry. Check your connection and retry.";
    case "not_found":
      return `No registry found at the requested location.`;
    case "rate_limited":
      return "Rate-limited by GitHub — try again in a few minutes.";
    case "parse_error":
      return "This registry has invalid JSON — contact the registry maintainer.";
    case "schema_version_unrecognized":
      return "This registry uses a schema version this Studio doesn't recognize yet.";
  }
}
