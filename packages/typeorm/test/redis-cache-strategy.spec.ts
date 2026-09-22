// Live Redis round-trip proof for TypeOrmCacheStrategy.
//
// Every other cache-strategy spec in this repository (cache-strategy.spec.ts)
// drives MockCacheStrategy — an in-process Map. This spec is the first one in
// the repository that constructs a real ioredis client and a real node-redis
// client against Docker Redis (compose service `redis`, 127.0.0.1:6399), and
// asserts against actual server state (the raw value, its TTL, and its
// disappearance after invalidate) rather than only "the call did not throw".
//
// Every key is namespaced with a per-run prefix (adapter name, process id,
// timestamp) so parallel or repeated runs against the shared container
// cannot collide with each other or with any other consumer's keys.
import Redis from 'ioredis';
import { createClient } from 'redis';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const REDIS_URL = 'redis://127.0.0.1:6399';
const RUN_PREFIX = `redis-cache-spec:typeorm:${process.pid}:${Date.now()}:`;

type IoredisClient = InstanceType<typeof Redis>;
type NodeRedisClient = ReturnType<typeof createClient>;
type RawClient = IoredisClient | NodeRedisClient;

interface ClientKind {
  name: 'ioredis' | 'node-redis';
  make: () => RawClient;
  /** Bring a freshly-constructed client to a state where raw commands can be issued directly (bypassing the strategy's own lazy auto-connect). */
  ensureReady: (client: RawClient) => Promise<void>;
  pttl: (client: RawClient, key: string) => Promise<number>;
  close: (client: RawClient) => Promise<void>;
}

const clientKinds: ClientKind[] = [
  {
    name: 'ioredis',
    make: () => new Redis(REDIS_URL),
    ensureReady: async (client) => {
      const raw = client as IoredisClient;
      if (raw.status === 'ready') return;
      await new Promise<void>((resolve, reject) => {
        raw.once('ready', () => resolve());
        raw.once('error', reject);
      });
    },
    pttl: (client, key) => (client as IoredisClient).pttl(key),
    close: async (client) => {
      await (client as IoredisClient).quit();
    },
  },
  {
    name: 'node-redis',
    make: () => createClient({ url: REDIS_URL }),
    ensureReady: async (client) => {
      const raw = client as NodeRedisClient;
      if (!raw.isOpen) await raw.connect();
    },
    pttl: async (client, key) => Number(await (client as NodeRedisClient).pTTL(key)),
    close: async (client) => {
      const raw = client as NodeRedisClient;
      if (raw.isOpen) await raw.quit();
    },
  },
];

describe.each(clientKinds)('TypeOrmCacheStrategy live Redis round trip [$name]', ({ name, make, ensureReady, pttl, close }) => {
  const prefix = `${RUN_PREFIX}${name}:`;
  let inspector: RawClient;

  beforeAll(async () => {
    inspector = make();
    await ensureReady(inspector);
  });

  afterEach(async () => {
    // Scoped cleanup: remove everything this describe block created so
    // repeated local runs never leak keys into the shared Redis container.
    const cleanupStrategy = new TypeOrmCacheStrategy(inspector);
    await cleanupStrategy.invalidate(prefix);
  });

  afterAll(async () => {
    await close(inspector);
  });

  it('wrap on a cold key calls fetchFn once; a second wrap for the same key returns the cached value without calling fetchFn again', async () => {
    const client = make();
    const strategy = new TypeOrmCacheStrategy(client);
    const key = `${prefix}miss-then-hit`;
    const fetchFn = jest.fn().mockResolvedValue({ value: 'fresh' });

    const first = await strategy.wrap(key, fetchFn, 5000);
    expect(first).toEqual({ value: 'fresh' });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Assert against real Redis state, not just "did not throw" — the key is
    // actually present on the server with a TTL set, proving a real round trip.
    const rawValue = await inspector.get(key);
    expect(rawValue).toBe(JSON.stringify({ value: 'fresh' }));
    const ttlMs = await pttl(inspector, key);
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(5000);

    const second = await strategy.wrap(key, fetchFn, 5000);
    expect(second).toEqual({ value: 'fresh' });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await close(client);
  });

  it('a value written through one strategy instance is visible to a second strategy instance built on a separately constructed client', async () => {
    const writerClient = make();
    const writer = new TypeOrmCacheStrategy(writerClient);
    const key = `${prefix}cross-instance`;
    await writer.wrap(key, jest.fn().mockResolvedValue({ value: 'cross-instance' }), 5000);
    await close(writerClient);

    const readerClient = make();
    const reader = new TypeOrmCacheStrategy(readerClient);
    const readerFetch = jest.fn().mockResolvedValue({ value: 'must-not-be-returned' });
    const value = await reader.wrap(key, readerFetch, 5000);

    expect(value).toEqual({ value: 'cross-instance' });
    expect(readerFetch).not.toHaveBeenCalled();

    await close(readerClient);
  });

  it('invalidate(prefix) removes every key under that prefix, and a following wrap calls fetchFn again', async () => {
    const client = make();
    const strategy = new TypeOrmCacheStrategy(client);
    const key = `${prefix}invalidate-me`;
    let calls = 0;
    const fetchFn = jest.fn().mockImplementation(async () => {
      calls += 1;
      return { value: `v${calls}` };
    });

    const first = await strategy.wrap(key, fetchFn, 5000);
    expect(first).toEqual({ value: 'v1' });

    await strategy.invalidate(prefix);

    const rawAfterInvalidate = await inspector.get(key);
    expect(rawAfterInvalidate).toBeFalsy();

    const second = await strategy.wrap(key, fetchFn, 5000);
    expect(second).toEqual({ value: 'v2' });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await close(client);
  });

  it('concurrent wraps of one cold key call fetchFn once', async () => {
    const client = make();
    const strategy = new TypeOrmCacheStrategy(client);
    const key = `${prefix}concurrent`;
    const fetchFn = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { value: 'concurrent-result' };
    });

    const results = await Promise.all([
      strategy.wrap(key, fetchFn, 5000),
      strategy.wrap(key, fetchFn, 5000),
      strategy.wrap(key, fetchFn, 5000),
    ]);

    expect(results).toEqual([
      { value: 'concurrent-result' },
      { value: 'concurrent-result' },
      { value: 'concurrent-result' },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await close(client);
  });
});
