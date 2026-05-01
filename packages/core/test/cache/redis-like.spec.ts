import { isRedisLike, toRedisLike } from '../../src/cache/redis-like.interface';

// ---------------------------------------------------------------------------
// Helpers: build minimal mock clients
// ---------------------------------------------------------------------------

function makeNodeRedisClient(opts: { isOpen?: boolean } = {}) {
  let isOpen = opts.isOpen ?? true;
  const connect = jest.fn(async () => {
    isOpen = true;
  });
  const client = {
    get isOpen() {
      return isOpen;
    },
    connect,
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null as string | null),
    del: jest.fn(async () => 0),
    scanIterator: jest.fn(),
  };
  return client;
}

function makeIoredisClient(opts: { status?: string } = {}) {
  const status = opts.status ?? 'ready';
  const client = {
    status,
    connect: jest.fn(async () => {}),
    duplicate: jest.fn(),
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null as string | null),
    del: jest.fn(async () => 0),
    scanStream: jest.fn(),
  };
  return client;
}

// ---------------------------------------------------------------------------
// isRedisLike
// ---------------------------------------------------------------------------

describe('isRedisLike', () => {
  it('returns false for plain object', () => {
    expect(isRedisLike({ set: jest.fn(), get: jest.fn(), del: jest.fn(), scanPrefix: jest.fn() })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRedisLike(null)).toBe(false);
  });

  it('returns true for an already-adapted client (branded symbol present)', () => {
    const adapted = toRedisLike(makeNodeRedisClient());
    expect(isRedisLike(adapted)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toRedisLike — detection
// ---------------------------------------------------------------------------

describe('toRedisLike — detection', () => {
  it('returns the same object when already a RedisLike (pass-through)', () => {
    const adapted = toRedisLike(makeNodeRedisClient());
    expect(toRedisLike(adapted)).toBe(adapted);
  });

  it('detects node-redis client (has scanIterator + connect + isOpen)', () => {
    const client = makeNodeRedisClient();
    const rl = toRedisLike(client);
    expect(isRedisLike(rl)).toBe(true);
  });

  it('detects ioredis client (has scanStream + duplicate + status)', () => {
    const client = makeIoredisClient();
    const rl = toRedisLike(client);
    expect(isRedisLike(rl)).toBe(true);
  });

  it('throws TypeError on plain unrecognized object', () => {
    expect(() => toRedisLike({ foo: 'bar' })).toThrow(TypeError);
    expect(() => toRedisLike({ foo: 'bar' })).toThrow('node-redis');
  });

  it('throws TypeError on null', () => {
    expect(() => toRedisLike(null)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// node-redis adapter — method calls
// ---------------------------------------------------------------------------

describe('node-redis adapter', () => {
  it('set passes { PX: ttl } option', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    const rl = toRedisLike(client);
    await rl.set('key', 'value', 5000);
    expect(client.set).toHaveBeenCalledWith('key', 'value', { PX: 5000 });
  });

  it('get forwards the key', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    client.get.mockResolvedValueOnce('hello');
    const rl = toRedisLike(client);
    const result = await rl.get('mykey');
    expect(result).toBe('hello');
    expect(client.get).toHaveBeenCalledWith('mykey');
  });

  it('del passes array of keys', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    const rl = toRedisLike(client);
    await rl.del(['a', 'b']);
    expect(client.del).toHaveBeenCalledWith(['a', 'b']);
  });

  it('del([]) short-circuits without calling client', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    const rl = toRedisLike(client);
    await rl.del([]);
    expect(client.del).not.toHaveBeenCalled();
  });

  it('scanPrefix consumes scanIterator with MATCH + COUNT', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    async function* fakeIter() {
      yield 'key1';
      yield 'key2';
    }
    client.scanIterator.mockReturnValue(fakeIter());
    const rl = toRedisLike(client);
    const batches: string[][] = [];
    for await (const batch of rl.scanPrefix('prefix:')) {
      batches.push(batch);
    }
    expect(client.scanIterator).toHaveBeenCalledWith({ MATCH: 'prefix:*', COUNT: 100 });
    expect(batches).toEqual([['key1'], ['key2']]);
  });

  it('auto-connects on first op when client is not open', async () => {
    const client = makeNodeRedisClient({ isOpen: false });
    const rl = toRedisLike(client);
    await rl.get('k');
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('does not call connect when client is already open', async () => {
    const client = makeNodeRedisClient({ isOpen: true });
    const rl = toRedisLike(client);
    await rl.get('k');
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('concurrent first ops dedup to a single connect call', async () => {
    const client = makeNodeRedisClient({ isOpen: false });
    const rl = toRedisLike(client);
    // Fire 3 ops before any resolve
    await Promise.all([rl.get('k1'), rl.get('k2'), rl.get('k3')]);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ioredis adapter — method calls
// ---------------------------------------------------------------------------

describe('ioredis adapter', () => {
  it('set uses positional PX syntax', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    const rl = toRedisLike(client);
    await rl.set('key', 'value', 3000);
    expect(client.set).toHaveBeenCalledWith('key', 'value', 'PX', 3000);
  });

  it('get forwards the key', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    (client.get as jest.Mock).mockResolvedValueOnce('world');
    const rl = toRedisLike(client);
    const result = await rl.get('k');
    expect(result).toBe('world');
  });

  it('del spreads keys as positional args', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    const rl = toRedisLike(client);
    await rl.del(['x', 'y', 'z']);
    expect(client.del).toHaveBeenCalledWith('x', 'y', 'z');
  });

  it('del([]) short-circuits without calling client', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    const rl = toRedisLike(client);
    await rl.del([]);
    expect(client.del).not.toHaveBeenCalled();
  });

  it('scanPrefix consumes scanStream with match + count', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    async function* fakeStream() {
      yield ['k1', 'k2'];
      yield ['k3'];
    }
    (client.scanStream as jest.Mock).mockReturnValue(fakeStream());
    const rl = toRedisLike(client);
    const batches: string[][] = [];
    for await (const batch of rl.scanPrefix('entity:')) {
      batches.push(batch);
    }
    expect(client.scanStream).toHaveBeenCalledWith({ match: 'entity:*', count: 100 });
    expect(batches).toEqual([['k1', 'k2'], ['k3']]);
  });

  it('auto-connects when status is "wait"', async () => {
    const client = makeIoredisClient({ status: 'wait' });
    const rl = toRedisLike(client);
    await rl.get('k');
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('does NOT call connect when status is "ready"', async () => {
    const client = makeIoredisClient({ status: 'ready' });
    const rl = toRedisLike(client);
    await rl.get('k');
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('does NOT call connect when status is "connecting"', async () => {
    const client = makeIoredisClient({ status: 'connecting' });
    const rl = toRedisLike(client);
    await rl.get('k');
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('concurrent first ops dedup to a single connect call', async () => {
    const client = makeIoredisClient({ status: 'wait' });
    const rl = toRedisLike(client);
    await Promise.all([rl.get('k1'), rl.get('k2'), rl.get('k3')]);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});
