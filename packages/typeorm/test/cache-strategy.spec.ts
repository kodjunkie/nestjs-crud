// Wave 1 + Wave 2 plan 21-02 implement this. Stub created in Wave 0
// so `yarn test:typeorm:postgres --testNamePattern="cache strategy"` finds the file.

const dialect = process.env.TYPEORM_CONNECTION as 'mysql' | undefined;
const runSuite = !dialect || dialect === 'mysql'; // default = postgres

(runSuite ? describe : describe.skip)(`TypeOrmCrudService cache strategy [${dialect ?? 'postgres'}]`, () => {
  it.todo('second read returns cached payload from MockCacheStrategy');
  it.todo('cleared cache triggers fresh DB query');
  it.todo('createOne invalidates entity-prefix cache entries');
  it.todo('?cache=0 bypasses cache for that request');
  it.todo('throws CrudCacheNotConfiguredError when @Crud cache set without strategy AND without DataSource.cache');
  it.todo('does NOT activate query.cache(ttl) step 7 when CacheStrategy wired (no double-cache)');
});
