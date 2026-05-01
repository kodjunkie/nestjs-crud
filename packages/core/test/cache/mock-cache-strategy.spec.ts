import { MockCacheStrategy } from '@nestjs-crud/core';

describe('MockCacheStrategy', () => {
  let cache: MockCacheStrategy;

  beforeEach(() => {
    cache = new MockCacheStrategy();
  });

  it('wrap returns cached value on second call within TTL', async () => {
    const fetchFn = jest.fn(async () => 'v1');
    const first = await cache.wrap('k', fetchFn, 60_000);
    const second = await cache.wrap('k', fetchFn, 60_000);
    expect(first).toBe('v1');
    expect(second).toBe('v1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('wrap calls fetchFn again after TTL expires', async () => {
    const fetchFn = jest.fn(async () => 'v');
    await cache.wrap('k', fetchFn, 1); // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));
    await cache.wrap('k', fetchFn, 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('get returns undefined for missing key', async () => {
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('get returns undefined after expiry', async () => {
    await cache.set('k', 'v', 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get('k')).toBeUndefined();
  });

  it('set stores value with TTL', async () => {
    await cache.set('k', 'v', 60_000);
    expect(await cache.get('k')).toBe('v');
  });

  it('invalidate(prefix) removes only keys with matching prefix', async () => {
    await cache.set('User:abc', 'u1', 60_000);
    await cache.set('User:def', 'u2', 60_000);
    await cache.set('Company:abc', 'c1', 60_000);
    await cache.invalidate('User:');
    expect(await cache.get('User:abc')).toBeUndefined();
    expect(await cache.get('User:def')).toBeUndefined();
    expect(await cache.get('Company:abc')).toBe('c1');
  });

  it('invalidate(prefix) leaves non-matching keys intact', async () => {
    await cache.set('Company:1', 'c', 60_000);
    await cache.invalidate('User:');
    expect(await cache.get('Company:1')).toBe('c');
  });

  // FIX 3 — single-flight dedup against thundering herd
  it('single-flight: 5 concurrent wrap() calls execute fetchFn exactly once', async () => {
    let invocations = 0;
    const slowFn = jest.fn(async () => {
      invocations++;
      await new Promise((r) => setTimeout(r, 30)); // simulate slow DB
      return 'v';
    });
    const results = await Promise.all([
      cache.wrap('k', slowFn, 60_000),
      cache.wrap('k', slowFn, 60_000),
      cache.wrap('k', slowFn, 60_000),
      cache.wrap('k', slowFn, 60_000),
      cache.wrap('k', slowFn, 60_000),
    ]);
    expect(results).toEqual(['v', 'v', 'v', 'v', 'v']);
    expect(slowFn).toHaveBeenCalledTimes(1);
    expect(invocations).toBe(1);
  });

  it('single-flight: failed fetch is NOT cached AND inflight entry is cleared', async () => {
    let attempt = 0;
    const flakyFn = jest.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error('boom');
      return 'v';
    });
    await expect(cache.wrap('k', flakyFn, 60_000)).rejects.toThrow('boom');
    // Second call should retry (NOT see cached failure, NOT see stuck inflight promise).
    const second = await cache.wrap('k', flakyFn, 60_000);
    expect(second).toBe('v');
    expect(flakyFn).toHaveBeenCalledTimes(2);
  });
});
