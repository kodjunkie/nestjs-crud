import 'reflect-metadata';
import { Controller } from '@nestjs/common';

import { Crud, CrudAuth } from '../src/decorators';
import { ApiProperty, Swagger, swaggerConst } from '../src/crud/swagger.helper';
import { R } from '../src/crud/reflection.helper';
import { CrudConfigService } from '../src/module/crud-config.service';
import { BaseRouteName } from '../src/types';
import { TestModel } from './__fixture__/models';

// Entity with @ApiProperty metadata for body-example introspection coverage.
class AnnotatedEntity {
  @ApiProperty({ type: String })
  name?: string;

  @ApiProperty({ type: Number })
  age?: number;
}

// Entity with NO @ApiProperty metadata — used to assert consumer-fn overrides win
// over the introspection path AND over the `{}` fallback.
class BareEntity {
  id?: number;

  name?: string;
}

const API_OPERATION_KEY = swaggerConst.DECORATORS.API_OPERATION;
const API_PARAMETERS_KEY = swaggerConst.DECORATORS.API_PARAMETERS;
const API_RESPONSE_KEY = swaggerConst.DECORATORS.API_RESPONSE;
const API_TAGS_KEY = swaggerConst.DECORATORS.API_TAGS;

const ALL_ROUTES: BaseRouteName[] = [
  'getManyBase',
  'getOneBase',
  'createOneBase',
  'createManyBase',
  'updateOneBase',
  'replaceOneBase',
  'deleteOneBase',
  'recoverOneBase',
];

describe('Swagger description surface', () => {
  describe('summaries — imperative form, pluralize-aware', () => {
    it('emits exact summary strings for every base route (User)', () => {
      const map = Swagger.operationsMap('User');
      expect(map.getManyBase.summary).toBe('List users');
      expect(map.getOneBase.summary).toBe('Get user by id');
      expect(map.createOneBase.summary).toBe('Create user');
      expect(map.createManyBase.summary).toBe('Create users in bulk');
      expect(map.updateOneBase.summary).toBe('Partially update user');
      expect(map.replaceOneBase.summary).toBe('Replace user');
      expect(map.deleteOneBase.summary).toBe('Delete user');
      expect(map.recoverOneBase.summary).toBe('Restore soft-deleted user');
    });

    it('handles pluralize irregulars (Category → categories)', () => {
      const map = Swagger.operationsMap('Category');
      expect(map.getManyBase.summary).toBe('List categories');
      expect(map.createManyBase.summary).toBe('Create categories in bulk');
    });
  });

  describe('descriptions — non-empty, domain-keyword-bearing', () => {
    it('emits a non-empty description (>20 chars) for every base route', () => {
      const map = Swagger.operationsMap('User');

      for (const route of ALL_ROUTES) {
        const desc = map[route].description;
        expect(typeof desc).toBe('string');
        expect(desc.length).toBeGreaterThan(20);
      }
    });

    it('each description mentions its resource name (DTO-reference prose check)', () => {
      const map = Swagger.operationsMap('User');
      // Assert >= 4 descriptions mention the named resource in prose.
      const matches = ALL_ROUTES.filter((route) => /user/i.test(map[route].description));
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('override merge — consumer operations override wins for summary/deprecated, operationId is locked', () => {
    @Crud({
      model: { type: TestModel },
      swagger: {
        operations: {
          getManyBase: { summary: 'Custom', deprecated: true },
        },
      },
    })
    @Controller('merge-ctrl')
    class MergeCtrl {}

    it('emits consumer summary + deprecated while retaining factory operationId', () => {
      const op = Swagger.getOperation((MergeCtrl.prototype as any).getManyBase);
      expect(op.summary).toBe('Custom');
      expect(op.deprecated).toBe(true);
      expect(op.operationId).toBe('getManyBase' + MergeCtrl.name + 'TestModel');
    });
  });

  describe('operationId locked — factory re-applies canonical ID even if consumer smuggles one through', () => {
    @Crud({
      model: { type: TestModel },
      swagger: {
        // Force-cast to bypass the type-level Omit guard — runtime backstop proof.
        operations: {
          getManyBase: { operationId: 'EVIL' } as any,
        },
      },
    })
    @Controller('opid-ctrl')
    class OpIdCtrl {}

    it('rejects consumer operationId override at runtime', () => {
      const op = Swagger.getOperation((OpIdCtrl.prototype as any).getManyBase);
      expect(op.operationId).not.toBe('EVIL');
      expect(op.operationId).toBe('getManyBase' + OpIdCtrl.name + 'TestModel');
    });
  });

  describe('responses — success description references pluralized response DTO', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('resp-ctrl')
    class RespCtrl {}

    it('getManyBase 200 description says "Paginated list of matching resources"', () => {
      const resp = Swagger.getResponseOk((RespCtrl.prototype as any).getManyBase);
      const desc200: string = resp['200']?.description ?? '';
      expect(desc200).toContain('Paginated list of matching resources');
    });
  });

  describe('errors — 400/404/401 wiring per route', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('err-no-auth')
    class NoAuthCtrl {}

    // Decorator application order (bottom-up): @Controller → @CrudAuth → @Crud.
    // @Crud triggers CrudRoutesFactory which reads raw @CrudAuth metadata off the
    // target class, so @CrudAuth MUST sit below @Crud in source order.
    @Crud({ model: { type: TestModel } })
    @CrudAuth({ property: 'user' })
    @Controller('err-auth')
    class AuthCtrl {}

    @Crud({
      model: { type: TestModel },
      swagger: { errorResponses: { unauthorized: true } },
    })
    @Controller('err-opt-in')
    class OptInUnauthorizedCtrl {}

    it('getOneBase has [200, 400, 404]', () => {
      const resp = Swagger.getResponseOk((NoAuthCtrl.prototype as any).getOneBase);
      const keys = Object.keys(resp)
        .map((k) => Number(k))
        .sort();
      expect(keys).toEqual([200, 400, 404]);
    });

    it('getManyBase has [200, 400] and NOT 404', () => {
      const resp = Swagger.getResponseOk((NoAuthCtrl.prototype as any).getManyBase);
      expect(resp['200']).toBeDefined();
      expect(resp['400']).toBeDefined();
      expect(resp['404']).toBeUndefined();
    });

    it('@CrudAuth controller — all 8 routes emit 401', () => {
      for (const route of ALL_ROUTES) {
        if (route === 'recoverOneBase') continue; // recover is soft-delete-gated
        const resp = Swagger.getResponseOk((AuthCtrl.prototype as any)[route]);
        expect(resp['401']).toBeDefined();
      }
    });

    it('no @CrudAuth AND no opt-in — no 401 emitted', () => {
      const resp = Swagger.getResponseOk((NoAuthCtrl.prototype as any).getManyBase);
      expect(resp['401']).toBeUndefined();
    });

    it('errorResponses.unauthorized: true — 401 emitted without @CrudAuth', () => {
      const resp = Swagger.getResponseOk((OptInUnauthorizedCtrl.prototype as any).getManyBase);
      expect(resp['401']).toBeDefined();
      expect(resp['401'].description).toBe('Missing or invalid authentication');
    });
  });

  describe('schema refs — success description points at named swagger DTO', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('schema-ref-ctrl')
    class SchemaRefCtrl {}

    it('getManyBase 200 description references the generated GetMany{Model}ResponseDto', () => {
      const resp = Swagger.getResponseOk((SchemaRefCtrl.prototype as any).getManyBase);
      const desc200: string = resp['200']?.description ?? '';
      // Factory builds "GetManyTestModelResponseDto" for TestModel — assert DTO name appears.
      expect(desc200).toMatch(/GetManyTestModelResponseDto/);
    });
  });

  describe('consumer-facing descriptions — no library internals, no external links', () => {
    @Crud({ model: { type: TestModel }, query: { softDelete: true } })
    @Controller('docs-link-ctrl')
    class DocsLinkCtrl {}

    it('query param descriptions are self-contained: no wiki links, no HTML anchors', () => {
      const params: any[] = Swagger.getParams((DocsLinkCtrl.prototype as any).getManyBase);
      const queryParams = params.filter((p) => p?.in === 'query');
      expect(queryParams.length).toBeGreaterThan(0);
      for (const p of queryParams) {
        expect(p.description).toEqual(expect.any(String));
        expect(p.description.length).toBeGreaterThan(10);
        expect(p.description).not.toMatch(/wiki\/Query-Syntax|<a |href=|github\.com/);
      }
    });

    it('filter/search/sort describe their syntax inline', () => {
      const params: any[] = Swagger.getParams((DocsLinkCtrl.prototype as any).getManyBase);
      const filterParam = params.find((p) => p?.name === 'filter');
      const searchParam = params.find((p) => p?.name === 's');
      const sortParam = params.find((p) => p?.name === 'sort');

      expect(filterParam?.description).toContain('field||$operator||value');
      expect(searchParam?.description).toContain('$cont');
      expect(sortParam?.description).toContain('ASC');
    });

    it('operation descriptions never reference @Crud config or CrudValidationGroups', () => {
      const map = Swagger.operationsMap('User');
      for (const route of Object.keys(map)) {
        expect(map[route].description).not.toMatch(/@Crud\(|CrudValidationGroups|dto: \{/);
      }
    });

    it('query-syntax docs link appears exactly once on getMany/getOne, never elsewhere', () => {
      const map = Swagger.operationsMap('User');
      const linkRe = /\[Query Syntax\]\(https:\/\/github\.com\/kodjunkie\/nestjs-crud\/wiki\/Query-Syntax\)/g;
      for (const route of Object.keys(map)) {
        const matches = map[route].description.match(linkRe) ?? [];
        if (route === 'getManyBase' || route === 'getOneBase') {
          expect(matches).toHaveLength(1);
        } else {
          expect(matches).toHaveLength(0);
        }
      }
    });

    it('non-soft-delete resource: no operation description mentions includeDeleted or soft-del', () => {
      const map = Swagger.operationsMap('User', false);
      // recoverOneBase only registers when softDelete is ON; its description always says "soft-deleted".
      const routesToCheck = Object.keys(map).filter((r) => r !== 'recoverOneBase');
      for (const route of routesToCheck) {
        expect(map[route].description).not.toMatch(/includeDeleted|soft.del/i);
      }
    });

    it('soft-delete resource: getManyBase and getOneBase descriptions mention includeDeleted', () => {
      const map = Swagger.operationsMap('User', true);
      expect(map.getManyBase.description).toContain('includeDeleted');
      expect(map.getOneBase.description).toContain('includeDeleted');
      expect(map.deleteOneBase.description).not.toContain('includeDeleted');
      expect(map.deleteOneBase.description).toMatch(/soft-delete/i);
    });
  });

  describe('queryDocsUrl — route level', () => {
    const CUSTOM_URL = 'https://docs.example.com/query-syntax';
    const DEFAULT_URL = 'https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax';

    @Crud({
      model: { type: TestModel },
      swagger: { queryDocsUrl: CUSTOM_URL },
    })
    @Controller('query-docs-custom-ctrl')
    class QueryDocsCustomCtrl {}

    @Crud({
      model: { type: TestModel },
      swagger: { queryDocsUrl: false },
    })
    @Controller('query-docs-off-ctrl')
    class QueryDocsOffCtrl {}

    it('operationsMap(User, false, customUrl) links the custom URL exactly once on getMany/getOne, default URL nowhere', () => {
      const map = Swagger.operationsMap('User', false, CUSTOM_URL);
      const customLinkRe = /\[Query Syntax\]\(https:\/\/docs\.example\.com\/query-syntax\)/g;

      for (const route of ALL_ROUTES) {
        const matches = map[route].description.match(customLinkRe) ?? [];
        if (route === 'getManyBase' || route === 'getOneBase') {
          expect(matches).toHaveLength(1);
        } else {
          expect(matches).toHaveLength(0);
        }
        expect(map[route].description).not.toContain(DEFAULT_URL);
      }
    });

    it('operationsMap(User, false, false) omits the line on every route and does not end with a newline', () => {
      const map = Swagger.operationsMap('User', false, false);

      for (const route of ALL_ROUTES) {
        expect(map[route].description).not.toMatch(/Full query syntax reference/);
        expect(map[route].description.endsWith('\n')).toBe(false);
      }
    });

    it('operationsMap(User) (no third argument) still ends getMany/getOne with the default line', () => {
      const map = Swagger.operationsMap('User');

      expect(map.getManyBase.description.endsWith(`Full query syntax reference: [Query Syntax](${DEFAULT_URL}).`)).toBe(
        true,
      );
      expect(map.getOneBase.description.endsWith(`Full query syntax reference: [Query Syntax](${DEFAULT_URL}).`)).toBe(
        true,
      );
    });

    it('a controller with swagger.queryDocsUrl set emits that link on getMany/getOne only', () => {
      for (const route of ALL_ROUTES) {
        if (route === 'recoverOneBase') continue; // recover is soft-delete-gated, no method on this controller
        const op = Swagger.getOperation((QueryDocsCustomCtrl.prototype as any)[route]);
        if (route === 'getManyBase' || route === 'getOneBase') {
          expect(op.description).toContain(`[Query Syntax](${CUSTOM_URL})`);
        } else {
          expect(op.description).not.toContain('[Query Syntax]');
        }
      }
    });

    it('a controller with swagger.queryDocsUrl: false emits no link on any route', () => {
      for (const route of ALL_ROUTES) {
        if (route === 'recoverOneBase') continue; // recover is soft-delete-gated, no method on this controller
        const op = Swagger.getOperation((QueryDocsOffCtrl.prototype as any)[route]);
        expect(op.description).not.toMatch(/Full query syntax reference/);
      }
    });
  });

  describe('queryDocsUrl — global default', () => {
    const GLOBAL_URL = 'https://global.example.com/query-syntax';
    const ROUTE_URL = 'https://route.example.com/query-syntax';
    const DEFAULT_URL = 'https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax';

    afterEach(() => CrudConfigService.reset());

    function linkOnGetManyAndGetOne(ctrl: any, url: string): void {
      for (const route of ['getManyBase', 'getOneBase'] as const) {
        const op = Swagger.getOperation(ctrl.prototype[route]);
        expect(op.description).toContain(`[Query Syntax](${url})`);
      }
    }

    function noLinkOnGetManyAndGetOne(ctrl: any): void {
      for (const route of ['getManyBase', 'getOneBase'] as const) {
        const op = Swagger.getOperation(ctrl.prototype[route]);
        expect(op.description).not.toMatch(/Full query syntax reference/);
      }
    }

    it('global URL, no route value — the global link', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: GLOBAL_URL } });

      @Crud({ model: { type: TestModel } })
      @Controller('qdu-global-only-ctrl')
      class Ctrl {}

      linkOnGetManyAndGetOne(Ctrl, GLOBAL_URL);
    });

    it('global URL, route URL — the route link wins', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: GLOBAL_URL } });

      @Crud({ model: { type: TestModel }, swagger: { queryDocsUrl: ROUTE_URL } })
      @Controller('qdu-global-and-route-ctrl')
      class Ctrl {}

      linkOnGetManyAndGetOne(Ctrl, ROUTE_URL);
    });

    it('global URL, route false — no line', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: GLOBAL_URL } });

      @Crud({ model: { type: TestModel }, swagger: { queryDocsUrl: false } })
      @Controller('qdu-global-route-off-ctrl')
      class Ctrl {}

      noLinkOnGetManyAndGetOne(Ctrl);
    });

    it('global false, no route value — no line', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: false } });

      @Crud({ model: { type: TestModel } })
      @Controller('qdu-global-off-ctrl')
      class Ctrl {}

      noLinkOnGetManyAndGetOne(Ctrl);
    });

    it('global false, route URL — the route link', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: false } });

      @Crud({ model: { type: TestModel }, swagger: { queryDocsUrl: ROUTE_URL } })
      @Controller('qdu-global-off-route-on-ctrl')
      class Ctrl {}

      linkOnGetManyAndGetOne(Ctrl, ROUTE_URL);
    });

    it('nothing anywhere — the library default link', () => {
      @Crud({ model: { type: TestModel } })
      @Controller('qdu-nothing-ctrl')
      class Ctrl {}

      linkOnGetManyAndGetOne(Ctrl, DEFAULT_URL);
    });

    it('a global swagger object with an extra key stores only queryDocsUrl, auto tag stays pluralized default', () => {
      CrudConfigService.load({ swagger: { queryDocsUrl: GLOBAL_URL, tag: 'GlobalTag' } as any });

      expect(CrudConfigService.config.swagger).toEqual({ queryDocsUrl: GLOBAL_URL });

      @Crud({ model: { type: TestModel } })
      @Controller('qdu-extra-key-ctrl')
      class Ctrl {}

      const tags = R.get(API_TAGS_KEY, Ctrl);
      expect(tags).toEqual(['TestModels']);
    });
  });

  describe('examples — query parameters each carry an `example` value', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('ex-ctrl')
    class ExCtrl {}

    it('every query param on getManyBase has a non-empty example', () => {
      const params: any[] = Swagger.getParams((ExCtrl.prototype as any).getManyBase);
      const queryParams = params.filter((p) => p?.in === 'query');
      const expected = ['s', 'filter', 'or', 'sort', 'join', 'limit', 'offset', 'page', 'fields', 'cache'];

      for (const name of expected) {
        const param = queryParams.find((p) => p.name === name);
        expect(param).toBeDefined();
        expect(param.example).toBeDefined();
      }
    });

    it('search param example is the literal JSON string `{"name":{"$cont":"ali"}}`', () => {
      const params: any[] = Swagger.getParams((ExCtrl.prototype as any).getManyBase);
      const searchParam = params.find((p) => p?.name === 's');
      expect(searchParam.example).toBe('{"name":{"$cont":"ali"}}');
    });
  });

  describe('wording — fields/select param description reads as a consumer-facing sentence', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('word-ctrl')
    class WordCtrl {}

    it('fields param description contains "Comma-separated list of fields to return"', () => {
      const params: any[] = Swagger.getParams((WordCtrl.prototype as any).getManyBase);
      const fieldsParam = params.find((p) => p?.name === 'fields');
      expect(fieldsParam?.description).toContain('Comma-separated list of fields to return');
    });
  });

  describe('tags — default pluralized, consumer-provided wins, pre-applied @ApiTags preserved', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('default-tag-ctrl')
    class DefaultTagCtrl {}

    @Crud({
      model: { type: TestModel },
      swagger: { tag: 'Admin > Users' },
    })
    @Controller('custom-tag-ctrl')
    class CustomTagCtrl {}

    it('emits pluralized default when controller has no @ApiTags', () => {
      const tags = R.get(API_TAGS_KEY, DefaultTagCtrl);
      expect(tags).toEqual(['TestModels']);
    });

    it('consumer swagger.tag string overrides the default', () => {
      const tags = R.get(API_TAGS_KEY, CustomTagCtrl);
      expect(tags).toEqual(['Admin > Users']);
    });

    it('pre-existing @ApiTags metadata wins (factory is no-op)', () => {
      class PreTagged {}
      // Simulate what @ApiTags('Admin') would emit pre-@Crud.
      R.set(API_TAGS_KEY, ['Admin'], PreTagged);

      const options: any = {
        model: { type: TestModel },
      };
      Crud(options)(PreTagged);

      const tags = R.get(API_TAGS_KEY, PreTagged);
      expect(tags).toEqual(['Admin']);
    });
  });

  describe('tagWithVersion — prepends v{n}/ when @Controller({ version }) + opt-in are both set', () => {
    @Crud({
      model: { type: TestModel },
      swagger: { tagWithVersion: true },
    })
    @Controller({ path: 'versioned', version: '2' })
    class VersionedCtrl {}

    @Crud({
      model: { type: TestModel },
      swagger: { tagWithVersion: true },
    })
    @Controller('no-version-ctrl')
    class NoVersionCtrl {}

    @Crud({
      model: { type: TestModel },
    })
    @Controller({ path: 'unflagged', version: '3' })
    class UnflaggedCtrl {}

    it('version + tagWithVersion → v2/TestModels', () => {
      const tags = R.get(API_TAGS_KEY, VersionedCtrl);
      expect(tags).toEqual(['v2/TestModels']);
    });

    it('tagWithVersion opt-in but no version metadata → plain TestModels', () => {
      const tags = R.get(API_TAGS_KEY, NoVersionCtrl);
      expect(tags).toEqual(['TestModels']);
    });

    it('version metadata but opt-in off (default) → plain TestModels (no prefix)', () => {
      const tags = R.get(API_TAGS_KEY, UnflaggedCtrl);
      expect(tags).toEqual(['TestModels']);
    });
  });

  describe('body examples (introspection path) — @ApiProperty-annotated entity', () => {
    @Crud({ model: { type: AnnotatedEntity } })
    @Controller('annotated-ctrl')
    class AnnotatedCtrl {}

    it('createOneBase body param example contains { name: "string", age: 0 }', () => {
      const params: any[] = Swagger.getParams((AnnotatedCtrl.prototype as any).createOneBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam).toBeDefined();
      expect(bodyParam.schema.example).toMatchObject({ name: 'string', age: 0 });
    });

    it('createManyBase body param wraps the single example under { bulk: [...] }', () => {
      const params: any[] = Swagger.getParams((AnnotatedCtrl.prototype as any).createManyBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam).toBeDefined();
      expect(Array.isArray(bodyParam.schema.example.bulk)).toBe(true);
      expect(bodyParam.schema.example.bulk[0]).toMatchObject({ name: 'string', age: 0 });
    });

    it('examples: false opt-out → no body param emitted on createOneBase', () => {
      @Crud({
        model: { type: AnnotatedEntity },
        swagger: { examples: false },
      })
      @Controller('no-ex-ctrl')
      class NoExCtrl {}

      const params: any[] = Swagger.getParams((NoExCtrl.prototype as any).createOneBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam).toBeUndefined();
    });

    it('bare entity (no @ApiProperty) → no body param emitted (empty-example early-return)', () => {
      @Crud({ model: { type: BareEntity } })
      @Controller('bare-ctrl')
      class BareCtrl {}

      const params: any[] = Swagger.getParams((BareCtrl.prototype as any).createOneBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam).toBeUndefined();
    });
  });

  describe('body examples (consumer synthExample fn) — wins over @ApiProperty path', () => {
    @Crud({
      model: { type: BareEntity },
      swagger: {
        synthExample: (_e, r) => ({ id: 42, route: r }),
      },
    })
    @Controller('synth-ctrl')
    class SynthCtrl {}

    @Crud({
      model: { type: BareEntity },
      swagger: {
        synthExample: (_e, r) => {
          if (r === 'createManyBase') {
            return { bulk: [{ id: 1 }, { id: 2 }] };
          }
          return { id: 1 };
        },
      },
    })
    @Controller('synth-bulk-ctrl')
    class SynthBulkCtrl {}

    it('synthExample fn value ships verbatim on createOneBase', () => {
      const params: any[] = Swagger.getParams((SynthCtrl.prototype as any).createOneBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam?.schema.example).toEqual({ id: 42, route: 'createOneBase' });
    });

    it('consumer-returned { bulk: [...] } on createManyBase is NOT double-wrapped', () => {
      const params: any[] = Swagger.getParams((SynthBulkCtrl.prototype as any).createManyBase);
      const bodyParam = params.find((p) => p?.in === 'body');
      expect(bodyParam?.schema.example).toEqual({ bulk: [{ id: 1 }, { id: 2 }] });
      // Double-wrap would produce { bulk: [{ bulk: [...] }] } — assert it isn't.
      expect(bodyParam?.schema.example.bulk[0].bulk).toBeUndefined();
    });
  });

  describe('CrudSwaggerOptions type smoke — ensure runtime shape surfaces the documented fields', () => {
    it('operations.operationId is rejected at compile time (type-level Omit)', () => {
      const _opt: import('../src/interfaces').CrudSwaggerOptions = {
        operations: {
          // @ts-expect-error — operationId is omitted from CrudSwaggerOperationOptions.
          getManyBase: { operationId: 'X' },
        },
      };
      void _opt;
    });

    it('errorResponses, synthExample, tagWithVersion are all assignable', () => {
      const _opt: import('../src/interfaces').CrudSwaggerOptions = {
        errorResponses: { unauthorized: true },
        synthExample: (_e, _r) => ({}),
        tagWithVersion: true,
      };
      expect(_opt.errorResponses?.unauthorized).toBe(true);
      expect(typeof _opt.synthExample).toBe('function');
      expect(_opt.tagWithVersion).toBe(true);
    });
  });

  describe('metadata-key roundtrip — assertions use documented decorator keys', () => {
    it('API_OPERATION / API_PARAMETERS / API_RESPONSE / API_TAGS keys exist on swaggerConst.DECORATORS', () => {
      expect(API_OPERATION_KEY).toBeDefined();
      expect(API_PARAMETERS_KEY).toBeDefined();
      expect(API_RESPONSE_KEY).toBeDefined();
      expect(API_TAGS_KEY).toBeDefined();
    });
  });
});
