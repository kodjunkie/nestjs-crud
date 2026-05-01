const provider = process.env.PRISMA_PROVIDER as 'postgresql' | 'mysql' | undefined;
const runSuite = provider === 'postgresql' || provider === 'mysql';

(runSuite ? describe : describe.skip)(`PrismaCrudService Redis cache strategy [${provider ?? 'skipped'}]`, () => {
  it.todo('second read returns cached payload from MockCacheStrategy');
  it.todo('cleared cache triggers fresh DB query');
  it.todo('createOne invalidates entity-prefix cache entries');
  it.todo('?cache=0 bypasses cache for that request');
  it.todo('throws CrudCacheNotConfiguredError when @Crud cache set without strategy');
});
