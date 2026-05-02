import 'jest-extended';
import { RequestQueryException } from '../src/exceptions/request-query.exception';
import { ParamsOptions, ParsedRequestParams } from '../src/interfaces';
import { RequestQueryParser } from '../src/request-query.parser';
import { QueryFilter, QueryJoin, QuerySort } from '../src/types';

describe('#request-query', () => {
  describe('RequestQueryParser', () => {
    let qp: RequestQueryParser;

    beforeEach(() => {
      qp = RequestQueryParser.create();
    });

    describe('#parseQury', () => {
      it('should return instance of RequestQueryParse', () => {
        expect((qp as any).parseQuery()).toBeInstanceOf(RequestQueryParser);
        expect((qp as any).parseQuery({})).toBeInstanceOf(RequestQueryParser);
      });

      describe('#parse fields', () => {
        it('should set empty array, 1', () => {
          const query = { select: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.fields).toMatchObject(expected);
        });
        it('should set empty array, 2', () => {
          const query = { foo: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.fields).toMatchObject(expected);
        });
        it('should set array, 1', () => {
          const query = { select: 'foo' };
          const expected = ['foo'];
          const test = qp.parseQuery(query);
          expect(test.fields).toMatchObject(expected);
        });
        it('should set array, 2', () => {
          const query = { select: 'foo,bar' };
          const expected = ['foo', 'bar'];
          const test = qp.parseQuery(query);
          expect(test.fields).toMatchObject(expected);
        });
      });

      describe('#parse filter', () => {
        it('should set empty array, 1', () => {
          const query = { filter: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.filter).toMatchObject(expected);
        });
        it('should set empty array, 2', () => {
          const query = { foo: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.filter).toMatchObject(expected);
        });
        it('should throw an error, 1', () => {
          const query = { filter: 'foo||invalid||bar' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should throw an error, 2', () => {
          const query = { filter: 'foo||eq' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set array, 1', () => {
          const query = { filter: 'foo||eq||bar' };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: 'bar' }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set array, 2', () => {
          const query = { filter: ['foo||eq||bar', 'baz||ne||boo'] };
          const expected: QueryFilter[] = [
            { field: 'foo', operator: 'eq', value: 'bar' },
            { field: 'baz', operator: 'ne', value: 'boo' },
          ];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
          expect(test.filter[1]).toMatchObject(expected[1]);
        });
        it('should set array, 3', () => {
          const query = { filter: ['foo||in||1,2'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'in', value: [1, 2] }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set array, 4', () => {
          const query = { filter: ['foo||isnull'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'isnull', value: '' }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set array, 5', () => {
          const query = { filter: ['foo||eq||{"foo":true}'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: '{"foo":true}' }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set array, 6', () => {
          const query = { filter: ['foo||eq||1'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: 1 }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set date, 7', () => {
          const now = new Date();
          const query = { filter: [`foo||eq||${now.toJSON()}`] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: now }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set false, 8', () => {
          const query = { filter: ['foo||eq||false'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: false }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set true, 9', () => {
          const query = { filter: ['foo||eq||true'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: true }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set number, 10', () => {
          const query = { filter: ['foo||eq||12345'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: 12345 }];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
        it('should set string, 11', () => {
          const query = { filter: ['foo||eq||4202140192612927005304000000236630'] };
          const expected: QueryFilter[] = [
            { field: 'foo', operator: 'eq', value: '4202140192612927005304000000236630' },
          ];
          const test = qp.parseQuery(query);
          expect(test.filter[0]).toMatchObject(expected[0]);
        });
      });

      describe('#parse or', () => {
        it('should set empty array, 1', () => {
          const query = { or: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.or).toMatchObject(expected);
        });
        it('should set empty array, 2', () => {
          const query = { foo: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.or).toMatchObject(expected);
        });
        it('should throw an error, 1', () => {
          const query = { or: 'foo||invalid||bar' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should throw an error, 2', () => {
          const query = { or: 'foo||eq' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set array, 1', () => {
          const query = { or: 'foo||eq||bar' };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'eq', value: 'bar' }];
          const test = qp.parseQuery(query);
          expect(test.or[0]).toMatchObject(expected[0]);
        });
        it('should set array, 2', () => {
          const query = { or: ['foo||eq||bar', 'baz||ne||boo'] };
          const expected: QueryFilter[] = [
            { field: 'foo', operator: 'eq', value: 'bar' },
            { field: 'baz', operator: 'ne', value: 'boo' },
          ];
          const test = qp.parseQuery(query);
          expect(test.or[0]).toMatchObject(expected[0]);
          expect(test.or[1]).toMatchObject(expected[1]);
        });
        it('should set array, 3', () => {
          const query = { or: ['foo||in||1,2'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'in', value: [1, 2] }];
          const test = qp.parseQuery(query);
          expect(test.or[0]).toMatchObject(expected[0]);
        });
        it('should set array, 4', () => {
          const query = { or: ['foo||isnull'] };
          const expected: QueryFilter[] = [{ field: 'foo', operator: 'isnull', value: '' }];
          const test = qp.parseQuery(query);
          expect(test.or[0]).toMatchObject(expected[0]);
        });
      });

      describe('#parse join', () => {
        it('should set empty array, 1', () => {
          const query = { join: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.join).toMatchObject(expected);
        });
        it('should set empty array, 2', () => {
          const query = { foo: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.join).toMatchObject(expected);
        });
        it('should set array, 1', () => {
          const query = { join: 'foo' };
          const expected: QueryJoin[] = [{ field: 'foo' }];
          const test = qp.parseQuery(query);
          expect(test.join[0]).toMatchObject(expected[0]);
        });
        it('should set array, 2', () => {
          const query = { join: ['foo', 'bar||baz,boo'] };
          const expected: QueryJoin[] = [{ field: 'foo' }, { field: 'bar', select: ['baz', 'boo'] }];
          const test = qp.parseQuery(query);
          expect(test.join[0]).toMatchObject(expected[0]);
          expect(test.join[1]).toMatchObject(expected[1]);
        });
      });

      describe('#parse sort', () => {
        it('should set empty array, 1', () => {
          const query = { sort: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.sort).toMatchObject(expected);
        });
        it('should set empty array, 2', () => {
          const query = { foo: '' };
          const expected = [];
          const test = qp.parseQuery(query);
          expect(test.sort).toMatchObject(expected);
        });
        it('should throw an error, 1', () => {
          const query = { sort: 'foo' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should throw an error, 2', () => {
          const query = { sort: 'foo,boo' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set array', () => {
          const query = { sort: ['foo,ASC', 'bar,DESC'] };
          const expected: QuerySort[] = [
            { field: 'foo', order: 'ASC' },
            { field: 'bar', order: 'DESC' },
          ];
          const test = qp.parseQuery(query);
          expect(test.sort[0]).toMatchObject(expected[0]);
          expect(test.sort[1]).toMatchObject(expected[1]);
        });
      });

      describe('#parse limit', () => {
        it('should set undefined, 1', () => {
          const query = { limit: '' };
          const test = qp.parseQuery(query);
          expect(test.limit).toBeUndefined();
        });
        it('should set undefined, 2', () => {
          const query = { foo: '' };
          const test = qp.parseQuery(query);
          expect(test.limit).toBeUndefined();
        });
        it('should throw an error', () => {
          const query = { limit: 'a' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set value', () => {
          const query = { limit: '10' };
          const expected = 10;
          const test = qp.parseQuery(query);
          expect(test.limit).toBe(expected);
        });
      });

      describe('#parse offset', () => {
        it('should set undefined, 1', () => {
          const query = { offset: '' };
          const test = qp.parseQuery(query);
          expect(test.offset).toBeUndefined();
        });
        it('should set undefined, 2', () => {
          const query = { foo: '' };
          const test = qp.parseQuery(query);
          expect(test.offset).toBeUndefined();
        });
        it('should throw an error', () => {
          const query = { offset: 'a' };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set value', () => {
          const query = { offset: '10' };
          const expected = 10;
          const test = qp.parseQuery(query);
          expect(test.offset).toBe(expected);
        });
      });

      describe('#parse page', () => {
        it('should set undefined, 1', () => {
          const query = { page: '' };
          const test = qp.parseQuery(query);
          expect(test.page).toBeUndefined();
        });
        it('should set undefined, 2', () => {
          const query = { foo: '' };
          const test = qp.parseQuery(query);
          expect(test.page).toBeUndefined();
        });
        it('should throw an error', () => {
          const query = { page: ['a'] };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set value', () => {
          const query = { page: ['10'] };
          const expected = 10;
          const test = qp.parseQuery(query);
          expect(test.page).toBe(expected);
        });
      });

      describe('#parse cache', () => {
        it('should set undefined, 1', () => {
          const query = { cache: '' };
          const test = qp.parseQuery(query);
          expect(test.cache).toBeUndefined();
        });
        it('should set undefined, 2', () => {
          const query = { foo: '' };
          const test = qp.parseQuery(query);
          expect(test.cache).toBeUndefined();
        });
        it('should throw an error', () => {
          const query = { cache: ['a'] };
          expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
        });
        it('should set value', () => {
          const query = { cache: ['10'] };
          const expected = 10;
          const test = qp.parseQuery(query);
          expect(test.cache).toBe(expected);
        });
      });

      describe('#parse options.cache (bypass-read flag with strict-known + silent-ignore-unknown semantics)', () => {
        it('?cache=0 → options.cache === false', () => {
          const query = { cache: '0' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBe(false);
        });

        it('?cache=1 → options.cache === true', () => {
          const query = { cache: '1' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBe(true);
        });

        it('?cache=false → options.cache === false', () => {
          const query = { cache: 'false' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBe(false);
        });

        it('?cache=true → options.cache === true', () => {
          const query = { cache: 'true' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBe(true);
        });

        it('absent ?cache → options.cache === undefined', () => {
          const query = { limit: '10' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBeUndefined();
        });

        it('numeric TTL ?cache=300000 → options.cache === undefined (NOT bypass) AND parsed.cache === 300000 (TTL preserved)', () => {
          const query = { cache: '300000' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBeUndefined();
          expect(test.cache).toBe(300000);
        });

        // silent-ignore unknown values (do NOT 400; preserves backward-compat)
        it('?cache=evil → options.cache === undefined (silent-ignore, no 400)', () => {
          const query = { cache: 'evil' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBeUndefined();
        });

        it('?cache=foo → options.cache === undefined (silent-ignore)', () => {
          const query = { cache: 'foo' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBeUndefined();
        });

        it('?cache= (empty) → options.cache === undefined (silent-ignore)', () => {
          const query = { cache: '' };
          const test = qp.parseQuery(query);
          expect(test.options?.cache).toBeUndefined();
        });

        it('getParsed() includes options field', () => {
          const query = { cache: '0' };
          qp.parseQuery(query);
          const parsed = qp.getParsed();
          expect(parsed.options).toBeDefined();
          expect(parsed.options?.cache).toBe(false);
        });
      });
    });

    describe('#parse search', () => {
      it('should set undefined', () => {
        const query = { foo: '' };
        const test = qp.parseQuery(query);
        expect(test.search).toBeUndefined();
      });
      it('should throw an error, 1', () => {
        const query = { s: 'invalid' };
        expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
      });
      it('should throw an error, 2', () => {
        const query = { s: 'true' };
        expect(qp.parseQuery.bind(qp, query)).toThrow(RequestQueryException);
      });
      it('should parse search', () => {
        const query = { s: '{"$or":[{"id":1},{"name":"foo"}]}' };
        const expected = { $or: [{ id: 1 }, { name: 'foo' }] };
        const test = qp.parseQuery(query);
        expect(test.search).toMatchObject(expected);
      });
    });

    describe('#parseParams', () => {
      it('should return instance of RequestQueryParse', () => {
        expect((qp as any).parseParams()).toBeInstanceOf(RequestQueryParser);
        expect((qp as any).parseParams({})).toBeInstanceOf(RequestQueryParser);
      });
      it('should throw an error, 1', () => {
        const params = { foo: 'bar' };
        const options = undefined;
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should throw an error, 2', () => {
        const params = { foo: 'bar' };
        const options = {};
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should throw an error, 3', () => {
        const params = { foo: 'bar' };
        const options = { foo: {} };
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should throw an error, 4', () => {
        const params = { foo: 'bar' };
        const options = { foo: { field: 'number' } };
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should throw an error, 5', () => {
        const params = { foo: 'bar' };
        const options = { foo: { field: 'foo', type: 'number' } };
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should throw an error, 6', () => {
        const params = { foo: 'bar' };
        const options = { foo: { field: 'foo', type: 'uuid' } };
        expect(qp.parseParams.bind(qp, params, options)).toThrow(RequestQueryException);
      });
      it('should set paramsFilter', () => {
        const params = {
          foo: 'cb1751fd-7fcf-4eb5-b38e-86428b1fd88d',
          bar: '1',
          buz: 'string',
          bigInt: '9007199254740999', // Bigger than Number.MAX_SAFE_INTEGER
        };
        const options: ParamsOptions = {
          foo: { field: 'foo', type: 'uuid' },
          bar: { field: 'bb', type: 'number' },
          buz: { field: 'buz', type: 'string' },
          bigInt: { field: 'bigInt', type: 'string' },
        };
        const test = qp.parseParams(params, options);
        const expected = [
          {
            field: 'foo',
            operator: '$eq',
            value: 'cb1751fd-7fcf-4eb5-b38e-86428b1fd88d',
          },
          { field: 'bb', operator: '$eq', value: 1 },
          { field: 'buz', operator: '$eq', value: 'string' },
          { field: 'bigInt', operator: '$eq', value: '9007199254740999' },
        ];
        expect(test.paramsFilter).toMatchObject(expected);
      });
      it('should set paramsFilter with disabled validation', () => {
        const params = {
          foo: 'cb1751fd',
          bar: '123',
        };
        const options: ParamsOptions = {
          foo: { disabled: true },
          bar: { field: 'bar', type: 'number' },
        };
        const test = qp.parseParams(params, options);
        const expected = [{ field: 'bar', operator: '$eq', value: 123 }];
        expect(test.paramsFilter).toMatchObject(expected);
      });
    });

    describe('#setAuthPersist', () => {
      it('it should set authPersist, 1', () => {
        qp.setAuthPersist();
        expect(qp.authPersist).toMatchObject({});
      });
      it('it should set authPersist, 2', () => {
        const test = { foo: 'bar' };
        qp.setAuthPersist(test);
        const parsed = qp.getParsed();
        expect(parsed.authPersist).toMatchObject(test);
      });
    });

    describe('#setAuthPersist — runtime persist-key validation', () => {
      const entityColumnsHash = { user_id: true, email: true, isActive: true };

      // Test 1: typo key not in entity → throws RequestQueryException naming the key
      it('throws RequestQueryException when persist key is not an entity column', () => {
        expect(() => qp.setAuthPersist({ userId: 123 }, entityColumnsHash)).toThrow(RequestQueryException);
        expect(() => qp.setAuthPersist({ userId: 123 }, entityColumnsHash)).toThrow(/userId/);
      });

      // Test 2: valid key present in entity → no throw
      it('succeeds silently when all persist keys are valid entity columns', () => {
        expect(() => qp.setAuthPersist({ user_id: 123 }, entityColumnsHash)).not.toThrow();
      });

      // Test 3: mixed valid + invalid → throws naming only the invalid key
      it('throws naming only the invalid key when mixed valid + invalid keys', () => {
        expect(() => qp.setAuthPersist({ user_id: 123, wrong: 'x' }, entityColumnsHash)).toThrow(/wrong/);
        expect(() => qp.setAuthPersist({ user_id: 123, wrong: 'x' }, entityColumnsHash)).not.toThrow(/user_id/);
      });

      // Test 4: empty / undefined → no-op, backwards compat
      it('is a no-op for empty or undefined persist', () => {
        expect(() => qp.setAuthPersist({}, entityColumnsHash)).not.toThrow();
        expect(() => qp.setAuthPersist(undefined, entityColumnsHash)).not.toThrow();
      });

      // Test 5: logger.warn emits key name only — never request body values (PII guard)
      it('emits logger.warn with invalid KEY NAME only, not persist body values', () => {
        const mockLogger = { warn: jest.fn() };
        const persistValue = 'secret-tenant-id-42';
        const persistObj = { wrongKey: persistValue };

        expect(() => qp.setAuthPersist(persistObj, entityColumnsHash, mockLogger)).toThrow(RequestQueryException);

        // logger.warn must have been called
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        const warnArg: string = mockLogger.warn.mock.calls[0][0];

        // Must contain the invalid key name
        expect(warnArg).toMatch(/wrongKey/);

        // Must NOT contain any value from the persist body
        expect(warnArg).not.toContain(persistValue);
        expect(warnArg).not.toContain('secret-tenant-id-42');
      });
    });

    describe('#setClassTransformOptions', () => {
      it('it should set classTransformOptions, 1', () => {
        qp.setClassTransformOptions();
        expect(qp.classTransformOptions).toMatchObject({});
      });
      it('it should set classTransformOptions, 2', () => {
        const testOptions = { groups: ['TEST'] };
        qp.setClassTransformOptions(testOptions);
        const parsed = qp.getParsed();
        expect(parsed.classTransformOptions).toMatchObject(testOptions);
      });
    });

    describe('#getParsed', () => {
      it('should return parsed params', () => {
        const expected: ParsedRequestParams = {
          fields: [],
          paramsFilter: [],
          search: undefined,
          authPersist: undefined,
          classTransformOptions: undefined,
          filter: [],
          or: [],
          join: [],
          sort: [],
          limit: undefined,
          offset: undefined,
          page: undefined,
          cache: undefined,
          includeDeleted: undefined,
        };
        const test = qp.getParsed();
        expect(test).toMatchObject(expected);
      });
    });
  });

  describe('#parse cursor', () => {
    it.todo('stores opaque cursor string when ?cursor=<token> present — Plan 01');
    it.todo('throws RequestQueryException on cursor + offset (mutex) — Plan 01');
    it.todo('throws RequestQueryException on cursor + page (mutex) — Plan 01');
  });
});
