// buildCacheKey unit (Wave 1 task 21-01-03 implements).

describe('buildCacheKey', () => {
  it.todo('produces stable hash regardless of payload key insertion order');
  it.todo('produces different hash when $and array order differs (semantically distinct)');
  it.todo('produces different hash when authPersist differs');
  it.todo('produces same hash when authPersist is undefined vs explicitly null (?? null guard)');
  it.todo('returns key prefixed with entityName + ":"');
  it.todo('returns 16-char hex hash suffix');
});
