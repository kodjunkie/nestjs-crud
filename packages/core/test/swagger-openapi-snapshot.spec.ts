import 'reflect-metadata';
import { Controller } from '@nestjs/common';

import { Crud, CrudAuth } from '../src/decorators';
import { ApiProperty } from '../src/crud/swagger.helper';
import { safeRequire } from '../src/util/safe-require';
import { TestModel } from './__fixture__/models';
import { TestService } from './__fixture__/services';

// Null-safe bootstrap: this spec drives a full NestJS + SwaggerModule bootstrap,
// so it requires BOTH @nestjs/swagger and @nestjs/testing at runtime. When either
// is absent (no-swagger sentinel CI matrix cell), the describe block self-skips
// rather than failing with a module-load error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const swagger: any = safeRequire('@nestjs/swagger');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testing: any = safeRequire('@nestjs/testing');
const describeMaybe = swagger && testing ? describe : describe.skip;

// Entity used for introspection-path body-example assertions.
class ExampleEntity {
  @ApiProperty({ type: Number })
  id?: number;

  @ApiProperty({ type: String })
  name?: string;
}

describeMaybe('Swagger OpenAPI document snapshot', () => {
  // Factory-computed operationId format: `${routeName}${ControllerClassName}${ModelClassName}`.
  // See crud-routes.factory.ts setSwaggerOperation.
  const ALL_ROUTE_NAMES = [
    'getManyBase',
    'getOneBase',
    'createOneBase',
    'createManyBase',
    'updateOneBase',
    'replaceOneBase',
    'deleteOneBase',
    'recoverOneBase',
  ];

  const ID_BASED_ROUTES = new Set(['getOneBase', 'updateOneBase', 'replaceOneBase', 'deleteOneBase', 'recoverOneBase']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function buildDocument(controllers: any[]): Promise<any> {
    const moduleRef = await testing.Test.createTestingModule({
      controllers,
      providers: [TestService],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const config = new swagger.DocumentBuilder().setTitle('snapshot').build();
      const document = swagger.SwaggerModule.createDocument(app, config);
      return document;
    } finally {
      await app.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectOperations(document: any): any[] {
    const ops: any[] = [];
    for (const pathKey of Object.keys(document.paths || {})) {
      const pathItem = document.paths[pathKey];
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
        if (pathItem[method]) {
          ops.push({ path: pathKey, method, op: pathItem[method] });
        }
      }
    }
    return ops;
  }

  describe('operationId coverage — all 8 generated routes appear in the document', () => {
    @Crud({
      model: { type: TestModel },
      query: { softDelete: true },
    })
    @Controller('snapshot-basic')
    class BasicCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it('emits the expected 8 operationIds (name + controller class + model class)', async () => {
      const document = await buildDocument([BasicCtrl]);
      const ops = collectOperations(document);
      const emittedIds = new Set(ops.map((entry) => entry.op.operationId).filter(Boolean));

      for (const routeName of ALL_ROUTE_NAMES) {
        const expected = `${routeName}${BasicCtrl.name}${TestModel.name}`;
        expect(emittedIds.has(expected)).toBe(true);
      }
    });
  });

  describe('non-empty summary + description on every emitted operation', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('snapshot-prose')
    class ProseCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it('every operation has typeof summary === string && length > 0, same for description', async () => {
      const document = await buildDocument([ProseCtrl]);
      const ops = collectOperations(document);
      expect(ops.length).toBeGreaterThan(0);

      for (const { op } of ops) {
        expect(typeof op.summary).toBe('string');
        expect(op.summary.length).toBeGreaterThan(0);
        expect(typeof op.description).toBe('string');
        expect(op.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('tag emission — default pluralized entity name appears on every operation', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('snapshot-tag-default')
    class TagDefaultCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it("every operation's tags array contains the pluralized default 'TestModels'", async () => {
      const document = await buildDocument([TagDefaultCtrl]);
      const ops = collectOperations(document);

      for (const { op } of ops) {
        expect(Array.isArray(op.tags)).toBe(true);
        expect(op.tags).toContain('TestModels');
      }
    });
  });

  describe('tagWithVersion — v{n}/ prefix when both @Controller({ version }) and opt-in are set', () => {
    @Crud({
      model: { type: TestModel },
      swagger: { tagWithVersion: true },
    })
    @Controller({ path: 'snapshot-versioned', version: '2' })
    class VersionedCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it("emits tags containing 'v2/TestModels' on every operation", async () => {
      const document = await buildDocument([VersionedCtrl]);
      const ops = collectOperations(document);
      expect(ops.length).toBeGreaterThan(0);

      for (const { op } of ops) {
        expect(op.tags).toContain('v2/TestModels');
      }
    });
  });

  describe('request-body examples — create/update/replace routes carry example payloads', () => {
    @Crud({ model: { type: ExampleEntity } })
    @Controller('snapshot-body')
    class BodyCtrl {
      constructor(public service: TestService<ExampleEntity>) {}
    }

    it('createOneBase, createManyBase, updateOneBase, replaceOneBase all carry a truthy body example', async () => {
      const document = await buildDocument([BodyCtrl]);
      const ops = collectOperations(document);

      const bodyRoutes = ['createOneBase', 'createManyBase', 'updateOneBase', 'replaceOneBase'];

      for (const routeName of bodyRoutes) {
        const expectedId = `${routeName}${BodyCtrl.name}${ExampleEntity.name}`;
        const entry = ops.find((e) => e.op.operationId === expectedId);
        expect(entry).toBeDefined();

        // Body example may surface in several places depending on how NestJS'
        // SwaggerModule merges the reflected body arg type with the explicit
        // API_PARAMETERS body entry the factory emits. Accept any of:
        //  - requestBody.content['application/json'].example (OpenAPI 3 canonical)
        //  - op.parameters[{ in: 'body' }].schema.example (legacy OAS2 rail)
        //  - requestBody.content['application/json'].schema.example
        const op = entry!.op;
        const viaRequestBodyExample = op.requestBody?.content?.['application/json']?.example;
        const viaRequestBodySchema = op.requestBody?.content?.['application/json']?.schema?.example;
        const viaParams = (op.parameters || []).find((p: any) => p?.in === 'body')?.schema?.example;
        const example = viaRequestBodyExample || viaRequestBodySchema || viaParams;
        expect(example).toBeTruthy();

        if (routeName === 'createManyBase') {
          expect(Array.isArray(example.bulk)).toBe(true);
        }
      }
    });
  });

  describe('400 response — emitted on every generated route', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('snapshot-400')
    class FourHundredCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it("every operation has responses['400'] defined", async () => {
      const document = await buildDocument([FourHundredCtrl]);
      const ops = collectOperations(document);
      expect(ops.length).toBeGreaterThan(0);

      for (const { op } of ops) {
        expect(op.responses['400']).toBeDefined();
      }
    });
  });

  describe('401 response — conditional on @CrudAuth OR errorResponses.unauthorized opt-in', () => {
    @Crud({ model: { type: TestModel } })
    @Controller('snapshot-no-auth')
    class NoAuthCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    // Application order (bottom-up): @Controller → @CrudAuth → @Crud.
    @Crud({ model: { type: TestModel } })
    @CrudAuth({ property: 'user' })
    @Controller('snapshot-auth')
    class AuthCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    @Crud({
      model: { type: TestModel },
      swagger: { errorResponses: { unauthorized: true } },
    })
    @Controller('snapshot-opt-in')
    class OptInCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it('no @CrudAuth AND no opt-in — no operation declares 401', async () => {
      const document = await buildDocument([NoAuthCtrl]);
      const ops = collectOperations(document);

      for (const { op } of ops) {
        expect(op.responses['401']).toBeUndefined();
      }
    });

    it('@CrudAuth controller — every operation declares 401', async () => {
      const document = await buildDocument([AuthCtrl]);
      const ops = collectOperations(document);
      expect(ops.length).toBeGreaterThan(0);

      for (const { op } of ops) {
        expect(op.responses['401']).toBeDefined();
      }
    });

    it('errorResponses.unauthorized opt-in without @CrudAuth — every operation declares 401', async () => {
      const document = await buildDocument([OptInCtrl]);
      const ops = collectOperations(document);
      expect(ops.length).toBeGreaterThan(0);

      for (const { op } of ops) {
        expect(op.responses['401']).toBeDefined();
      }
    });
  });

  describe('404 response — emitted only on id-based routes', () => {
    @Crud({
      model: { type: TestModel },
      query: { softDelete: true },
    })
    @Controller('snapshot-404')
    class FourOhFourCtrl {
      constructor(public service: TestService<TestModel>) {}
    }

    it('id-based routes (get/update/replace/delete/recover) declare 404; collection routes do not', async () => {
      const document = await buildDocument([FourOhFourCtrl]);
      const ops = collectOperations(document);

      for (const routeName of ALL_ROUTE_NAMES) {
        const expectedId = `${routeName}${FourOhFourCtrl.name}${TestModel.name}`;
        const entry = ops.find((e) => e.op.operationId === expectedId);
        expect(entry).toBeDefined();

        if (ID_BASED_ROUTES.has(routeName)) {
          expect(entry!.op.responses['404']).toBeDefined();
        } else {
          expect(entry!.op.responses['404']).toBeUndefined();
        }
      }
    });
  });
});
