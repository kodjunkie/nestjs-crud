/**
 * Narrow Redis client surface used by built-in cache strategies.
 *
 * Both `redis` (node-redis v5) and `ioredis` adapt to this — consumers pass
 * either client directly to the strategy ctor; auto-detection chooses the
 * adapter. Lazy-once auto-connect: first op triggers `connect()` if needed;
 * concurrent first ops dedup to a single connect call.
 *
 * Not exported as a strategy contract — strategies remain the public surface.
 * This interface exists so consumers can also pass a fully custom client by
 * implementing the 4 methods themselves.
 */
export interface RedisLike {
  /** Set key with TTL in milliseconds. */
  set(key: string, value: string, ttlMs: number): Promise<unknown>;

  /** Get raw string or null/undefined when absent. */
  get(key: string): Promise<string | null | undefined>;

  /** Delete one or more keys. No-op when empty. */
  del(keys: string[]): Promise<unknown>;

  /** Iterate keys matching prefix. Yields batches. NEVER use KEYS *. */
  scanPrefix(prefix: string, count?: number): AsyncIterable<string[]>;
}

const REDIS_LIKE = Symbol.for('nestjs-crud.RedisLike');

interface RedisLikeBranded extends RedisLike {
  readonly [REDIS_LIKE]: true;
}

export function isRedisLike(c: unknown): c is RedisLike {
  return typeof c === 'object' && c !== null && (c as any)[REDIS_LIKE] === true;
}

/**
 * Adapt a node-redis v5 or ioredis client to RedisLike. Returns input
 * unchanged when already adapted. Throws TypeError on unrecognized client.
 */
export function toRedisLike(client: unknown): RedisLike {
  if (isRedisLike(client)) return client;
  if (isNodeRedis(client)) return adaptNodeRedis(client);
  if (isIoredis(client)) return adaptIoredis(client);
  throw new TypeError(
    'Cache backend client must be a node-redis (v5) instance, an ioredis instance, or implement the RedisLike interface.',
  );
}

function isNodeRedis(c: any): boolean {
  return (
    c != null &&
    typeof c === 'object' &&
    typeof c.scanIterator === 'function' &&
    typeof c.connect === 'function' &&
    'isOpen' in c
  );
}

function isIoredis(c: any): boolean {
  return (
    c != null &&
    typeof c === 'object' &&
    typeof c.scanStream === 'function' &&
    typeof c.duplicate === 'function' &&
    'status' in c
  );
}

function adaptNodeRedis(client: any): RedisLikeBranded {
  let connectPromise: Promise<void> | null = null;

  const ensureConnected = async (): Promise<void> => {
    if (client.isOpen) return;
    if (!connectPromise) connectPromise = client.connect();
    await connectPromise;
  };

  return {
    [REDIS_LIKE]: true,
    async set(key, value, ttlMs) {
      await ensureConnected();
      return client.set(key, value, { PX: ttlMs });
    },
    async get(key) {
      await ensureConnected();
      return client.get(key);
    },
    async del(keys) {
      if (!keys.length) return 0;
      await ensureConnected();
      return client.del(keys);
    },
    async *scanPrefix(prefix, count = 100) {
      await ensureConnected();
      const iter = client.scanIterator({ MATCH: `${prefix}*`, COUNT: count });
      for await (const item of iter) {
        yield Array.isArray(item) ? item : [item];
      }
    },
  } as RedisLikeBranded;
}

function adaptIoredis(client: any): RedisLikeBranded {
  let connectPromise: Promise<void> | null = null;

  const ensureConnected = async (): Promise<void> => {
    // 'ready' = fully connected; 'connecting' = ioredis auto-queues commands → safe
    if (client.status === 'ready' || client.status === 'connecting') return;
    if (!connectPromise) {
      connectPromise = client.connect().catch((err: unknown) => {
        connectPromise = null; // allow retry on next op
        throw err;
      });
    }
    await connectPromise;
  };

  return {
    [REDIS_LIKE]: true,
    async set(key, value, ttlMs) {
      await ensureConnected();
      return client.set(key, value, 'PX', ttlMs);
    },
    async get(key) {
      await ensureConnected();
      return client.get(key);
    },
    async del(keys) {
      if (!keys.length) return 0;
      await ensureConnected();
      return client.del(...keys);
    },
    async *scanPrefix(prefix, count = 100) {
      await ensureConnected();
      const stream = client.scanStream({ match: `${prefix}*`, count });
      for await (const batch of stream as AsyncIterable<string[]>) {
        yield batch;
      }
    },
  } as RedisLikeBranded;
}
