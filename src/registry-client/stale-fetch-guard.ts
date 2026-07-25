// Guards against stale-fetch races: switching the selected token/network
// while a previous fetch is in-flight must not let the older response
// overwrite the newer selection's state. CEO review Section 4 finding.
export class StaleFetchGuard {
  private currentToken: symbol | undefined;

  /** Call before starting a new fetch. Returns a token to pass to isCurrent(). */
  begin(): symbol {
    const token = Symbol();
    this.currentToken = token;
    return token;
  }

  /** Call when a fetch resolves. Only apply the result if this is still true. */
  isCurrent(token: symbol): boolean {
    return this.currentToken === token;
  }
}
