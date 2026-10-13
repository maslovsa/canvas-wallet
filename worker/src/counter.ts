// Fixed-window counters for the abuse limits (plan E3). Pure logic over an injected storage object, so
// it is unit-tested like any other module; the Durable Object in index.ts is a thin wrapper that also
// serializes every operation, which is what makes read-modify-write atomic (a plain KV counter is not).

export interface CounterStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
}

interface Entry {
  bucket: number;
  count: number;
}

export interface TakeResult {
  allowed: boolean;
  count: number;
}

export class Counter {
  constructor(private storage: CounterStorage) {}

  private async read(key: string, bucket: number): Promise<Entry> {
    const stored = (await this.storage.get(key)) as Entry | undefined;
    // A different bucket means the window rolled over: start from zero (the old value is simply replaced on write).
    return stored && stored.bucket === bucket ? stored : { bucket, count: 0 };
  }

  /** Current count in the window, without changing it. */
  async peek(key: string, nowMs: number, windowMs: number): Promise<number> {
    return (await this.read(key, Math.floor(nowMs / windowMs))).count;
  }

  /** Counts one use if the window still has room. Never exceeds `limit`. */
  async take(key: string, limit: number, nowMs: number, windowMs: number): Promise<TakeResult> {
    const bucket = Math.floor(nowMs / windowMs);
    const entry = await this.read(key, bucket);
    if (entry.count >= limit) return { allowed: false, count: entry.count };
    const next = { bucket, count: entry.count + 1 };
    await this.storage.put(key, next);
    return { allowed: true, count: next.count };
  }
}
