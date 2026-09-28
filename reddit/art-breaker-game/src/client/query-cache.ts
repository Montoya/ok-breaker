type QueryCacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

export type QueryCacheHit<T> = QueryCacheEntry<T> & {
  fresh: boolean;
};

export class QueryCache<T> {
  readonly #entries = new Map<string, QueryCacheEntry<T>>();
  readonly #requests = new Map<string, Promise<T>>();
  readonly #versions = new Map<string, number>();

  constructor(readonly ttlMs: number) {}

  read(key: string, now = Date.now()): QueryCacheHit<T> | undefined {
    const entry = this.#entries.get(key);
    return entry
      ? { ...entry, fresh: now - entry.fetchedAt <= this.ttlMs }
      : undefined;
  }

  set(key: string, data: T, fetchedAt = Date.now()): void {
    this.#entries.set(key, { data, fetchedAt });
  }

  load(key: string, request: () => Promise<T>): Promise<T> {
    const current = this.#requests.get(key);
    if (current) return current;
    const version = this.#versions.get(key) ?? 0;
    const pending = request()
      .then((data) => {
        if ((this.#versions.get(key) ?? 0) === version) this.set(key, data);
        return data;
      })
      .finally(() => {
        if (this.#requests.get(key) === pending) this.#requests.delete(key);
      });
    this.#requests.set(key, pending);
    return pending;
  }

  invalidate(matches: (key: string) => boolean): void {
    const keys = new Set([...this.#entries.keys(), ...this.#requests.keys()]);
    for (const key of keys) {
      if (!matches(key)) continue;
      this.#entries.delete(key);
      this.#requests.delete(key);
      this.#versions.set(key, (this.#versions.get(key) ?? 0) + 1);
    }
  }
}
