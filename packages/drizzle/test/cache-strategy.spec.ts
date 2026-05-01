const dialect = process.env.DRIZZLE_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`DrizzleCrudService cache strategy [${dialect ?? 'skipped'}]`, () => {
  it.todo('second read returns cached payload from MockCacheStrategy');
  it.todo('cleared cache triggers fresh DB query');
  it.todo('createOne invalidates entity-prefix cache entries');
  it.todo('?cache=0 bypasses cache for that request');
  it.todo('throws CrudCacheNotConfiguredError when @Crud cache set without strategy');
});
