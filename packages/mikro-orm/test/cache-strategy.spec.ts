const dialect = process.env.MIKRO_ORM_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`MikroOrmCrudService cache strategy [${dialect ?? 'skipped'}]`, () => {
  it.todo('second read returns cached payload from MockCacheStrategy');
  it.todo('cleared cache triggers fresh DB query');
  it.todo('createOne invalidates entity-prefix cache entries');
  it.todo('?cache=0 bypasses cache for that request');
  it.todo('thunk invariant preserved: getEm() called fresh per call inside cache closure');
});
