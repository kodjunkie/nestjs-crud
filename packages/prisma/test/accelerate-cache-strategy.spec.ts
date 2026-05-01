// PrismaAccelerateCacheStrategy unit spec (Wave 2 plan 21-04).
// No real DB required — all cases mock the Accelerate delegate.
// Exercises: AsyncLocalStorage context injection, ms→s conversion (FIX 1),
// try/finally clear-on-resolve + clear-on-reject, invalidate tag mapping,
// constructor guard for missing $accelerate.

import { PrismaAccelerateCacheStrategy } from '@nestjs-crud/prisma';

describe('PrismaAccelerateCacheStrategy', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      $accelerate: { invalidate: jest.fn().mockResolvedValue(undefined) },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wrap() attaches { cacheStrategy: { ttl } } to AsyncLocalStorage context', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);
    let observed: { cacheStrategy?: { ttl: number } } | undefined;
    await strategy.wrap(
      'k',
      async () => {
        observed = PrismaAccelerateCacheStrategy.currentContext.getStore();
        return 'v';
      },
      5000,
    );
    expect(observed?.cacheStrategy).toBeDefined();
  });

  // FIX 1 — explicit ms→s conversion via Math.ceil(ttl/1000)
  it('wrap() converts ttl from milliseconds to SECONDS via Math.ceil(ttl/1000) before attaching to context (FIX 1)', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);

    let observed5000: { cacheStrategy?: { ttl: number } } | undefined;
    await strategy.wrap(
      'k',
      async () => {
        observed5000 = PrismaAccelerateCacheStrategy.currentContext.getStore();
        return 'v';
      },
      5000,
    ); // 5000ms → expect 5s in context
    expect(observed5000?.cacheStrategy?.ttl).toBe(5);

    let observed1500: { cacheStrategy?: { ttl: number } } | undefined;
    await strategy.wrap(
      'k',
      async () => {
        observed1500 = PrismaAccelerateCacheStrategy.currentContext.getStore();
        return 'v';
      },
      1500,
    ); // 1500ms → Math.ceil(1.5) = 2s (round-up never under-caches)
    expect(observed1500?.cacheStrategy?.ttl).toBe(2);
  });

  it('wrap() returns Promise<T> from fetchFn (universal interface compliance)', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);
    const result = await strategy.wrap('k', async () => 'v', 5000);
    expect(result).toBe('v');
  });

  it('wrap() clears context after fetchFn resolves', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);
    await strategy.wrap('k', async () => 'v', 5000);
    expect(PrismaAccelerateCacheStrategy.currentContext.getStore()).toBeUndefined();
  });

  it('wrap() clears context after fetchFn rejects', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);
    await expect(
      strategy.wrap(
        'k',
        async () => {
          throw new Error('boom');
        },
        5000,
      ),
    ).rejects.toThrow('boom');
    expect(PrismaAccelerateCacheStrategy.currentContext.getStore()).toBeUndefined();
  });

  it('invalidate(prefix) calls $accelerate.invalidate({ tags: [prefix] })', async () => {
    const strategy = new PrismaAccelerateCacheStrategy(mockClient);
    await strategy.invalidate('User:');
    expect(mockClient.$accelerate.invalidate).toHaveBeenCalledWith({ tags: ['User:'] });
  });

  it('throws useful error when $accelerate is missing on PrismaClient', () => {
    expect(() => new PrismaAccelerateCacheStrategy({} as any)).toThrow(/\$accelerate not found/);
  });
});
