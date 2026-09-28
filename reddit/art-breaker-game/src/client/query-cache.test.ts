import { describe, expect, it, vi } from 'vitest';
import { QueryCache } from './query-cache';

describe('QueryCache', () => {
  it('marks cached data stale after its TTL', () => {
    const cache = new QueryCache<string>(1_000);
    cache.set('page:1', 'first', 2_000);

    expect(cache.read('page:1', 3_000)).toMatchObject({
      data: 'first',
      fresh: true,
    });
    expect(cache.read('page:1', 3_001)).toMatchObject({
      data: 'first',
      fresh: false,
    });
  });

  it('deduplicates requests for the same key', async () => {
    const cache = new QueryCache<string>(1_000);
    const request = vi.fn(async () => 'loaded');

    const first = cache.load('page:1', request);
    const second = cache.load('page:1', request);

    await expect(Promise.all([first, second])).resolves.toEqual([
      'loaded',
      'loaded',
    ]);
    expect(request).toHaveBeenCalledOnce();
    expect(cache.read('page:1')?.data).toBe('loaded');
  });

  it('invalidates matching entries without clearing other data', () => {
    const cache = new QueryCache<string>(1_000);
    cache.set('board-a:0', 'a');
    cache.set('board-b:0', 'b');

    cache.invalidate((key) => key.startsWith('board-a:'));

    expect(cache.read('board-a:0')).toBeUndefined();
    expect(cache.read('board-b:0')?.data).toBe('b');
  });

  it('does not restore invalidated data from an older request', async () => {
    const cache = new QueryCache<string>(1_000);
    let resolveRequest = (_value: string): void => undefined;
    const pending = cache.load(
      'board-a:0',
      () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve;
        })
    );

    cache.invalidate((key) => key === 'board-a:0');
    resolveRequest('stale');
    await pending;

    expect(cache.read('board-a:0')).toBeUndefined();
  });
});
