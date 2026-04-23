import { MikroOrmCrudService } from '../src/mikro-orm-crud.service';

// Mock metadata structure matching MikroORM's EntityMetadata.properties
const mockProperties: Record<string, any> = {
  id: { name: 'id', fieldNames: ['id'], primary: true, persist: true, kind: undefined },
  name: { name: 'name', fieldNames: ['name'], primary: false, persist: true, kind: undefined },
  age: { name: 'age', fieldNames: ['age'], primary: false, persist: true, kind: undefined },
  email: { name: 'email', fieldNames: ['email'], primary: false, persist: true, kind: undefined },
  isActive: { name: 'isActive', fieldNames: ['is_active'], primary: false, persist: true, kind: undefined },
  deletedAt: { name: 'deletedAt', fieldNames: ['deleted_at'], primary: false, persist: true, kind: undefined },
};

const mockMetadata = {
  properties: mockProperties,
  primaryKeys: ['id'],
  tableName: 'test_users',
  filters: {},
};

describe('MikroOrmCrudService', () => {
  let service: any;

  beforeEach(() => {
    service = Object.create(MikroOrmCrudService.prototype);
    service.metadata = mockMetadata;
    service.relationsHash = new Map();
    service.dbDialect = 'postgresql';
    service.onInitMapEntityColumns();
    // Stub sanitizer: adapter ctor was bypassed via Object.create, so wire a
    // no-op sanitizer for method-level unit tests. Denylist coverage lives in
    // packages/core/test/input-sanitizer.spec.ts.
    service.sanitizer = {
      check: () => true,
      assert: () => undefined,
    };
  });

  describe('#onInitMapEntityColumns', () => {
    it('should discover all columns', () => {
      expect(service.entityColumns).toContain('id');
      expect(service.entityColumns).toContain('name');
      expect(service.entityColumns).toContain('age');
      expect(service.entityColumns).toContain('email');
      expect(service.entityColumns).toContain('isActive');
      expect(service.entityColumns).toContain('deletedAt');
    });

    it('should have correct column count', () => {
      expect(service.entityColumns.length).toBe(6);
    });

    it('should detect primary key', () => {
      expect(service.entityPrimaryColumns).toContain('id');
    });

    it('should have single primary key', () => {
      expect(service.entityPrimaryColumns.length).toBe(1);
    });

    it('should detect soft delete column', () => {
      expect(service.entityHasDeleteColumn).toBe(true);
      expect(service.softDeleteColumn).toBe('deletedAt');
    });

    it('should build propertiesMap', () => {
      expect(service.propertiesMap).toBeDefined();
      expect(service.propertiesMap.id).toBeDefined();
      expect(service.propertiesMap.name).toBeDefined();
    });

    it('should not detect soft delete on entity without deletedAt', () => {
      const noDeleteMetadata = {
        properties: {
          id: { name: 'id', fieldNames: ['id'], primary: true, persist: true, kind: undefined },
          name: { name: 'name', fieldNames: ['name'], primary: false, persist: true, kind: undefined },
        },
        primaryKeys: ['id'],
        tableName: 'no_delete',
        filters: {},
      };
      const svc: any = Object.create(MikroOrmCrudService.prototype);
      svc.metadata = noDeleteMetadata;
      svc.entityHasDeleteColumn = false;
      svc.softDeleteColumn = null;
      svc.relationsHash = new Map();
      svc.onInitMapEntityColumns();
      expect(svc.entityHasDeleteColumn).toBe(false);
      expect(svc.softDeleteColumn).toBeNull();
    });

    it('should detect soft delete via SoftDelete filter', () => {
      const filteredMetadata = {
        properties: {
          id: { name: 'id', fieldNames: ['id'], primary: true, persist: true, kind: undefined },
          removed: { name: 'removed', fieldNames: ['removed'], primary: false, persist: true, kind: undefined },
        },
        primaryKeys: ['id'],
        tableName: 'filtered_entity',
        filters: { softDelete: { name: 'softDelete', cond: { removed: { $eq: false } } } },
      };
      const svc: any = Object.create(MikroOrmCrudService.prototype);
      svc.metadata = filteredMetadata;
      svc.entityHasDeleteColumn = false;
      svc.softDeleteColumn = null;
      svc.relationsHash = new Map();
      svc.onInitMapEntityColumns();
      expect(svc.entityHasDeleteColumn).toBe(true);
    });

    it('should skip relation properties from entityColumns', () => {
      const relMetadata = {
        properties: {
          id: { name: 'id', fieldNames: ['id'], primary: true, persist: true, kind: undefined },
          name: { name: 'name', fieldNames: ['name'], primary: false, persist: true, kind: undefined },
          posts: { name: 'posts', kind: '1:m', persist: true, entity: () => ({}) },
        },
        primaryKeys: ['id'],
        tableName: 'with_rels',
        filters: {},
      };
      const svc: any = Object.create(MikroOrmCrudService.prototype);
      svc.metadata = relMetadata;
      svc.entityHasDeleteColumn = false;
      svc.softDeleteColumn = null;
      svc.relationsHash = new Map();
      svc.onInitMapEntityColumns();
      expect(svc.entityColumns).toContain('id');
      expect(svc.entityColumns).toContain('name');
      expect(svc.entityColumns).not.toContain('posts');
    });
  });

  // `sqlInjectionRegEx parity` block deleted during the v2.0 input-sanitizer migration;
  // the denylist regex was subsequently removed entirely in the v2.0 cleanup.
  // Adapters now delegate field validation to `InputSanitizer` (pure allowlist).
  // See packages/core/test/input-sanitizer.spec.ts for the class-level matrix.

  // Blocks `#getSelect`, `#getSort`, `#getSoftDeleteCondition`,
  // `#buildPrimaryKeyCondition`, `#buildSearchCondition`, `#getColumn` were
  // removed during the v2.0 adapter-alignment refactor: these methods now live on
  // `MikroOrmQueryTranslator` (getSelect/mapSort/getSoftDeleteCondition/
  // buildWhere) and are exercised via translator unit specs added in
  // Plan 09. Retaining them on the service would double-cover internals
  // that the service no longer owns after the Pattern-1 extraction.
  //
  // See:
  //   - packages/mikro-orm/src/mikro-orm-query-translator.ts

  // `SQL injection detection` block deleted during the v2.0 input-sanitizer migration — coverage now
  // lives in packages/core/test/input-sanitizer.spec.ts (class-level unit).

  describe('#getAllowedColumns', () => {
    it('should return all columns when no allow/exclude', () => {
      const result = service.getAllowedColumns(service.entityColumns, {});
      expect(result).toEqual(service.entityColumns);
    });

    it('should filter by allow list', () => {
      const result = service.getAllowedColumns(service.entityColumns, { allow: ['name', 'email'] });
      expect(result).toContain('name');
      expect(result).toContain('email');
      expect(result).not.toContain('age');
    });

    it('should filter by exclude list', () => {
      const result = service.getAllowedColumns(service.entityColumns, { exclude: ['deletedAt'] });
      expect(result).not.toContain('deletedAt');
      expect(result).toContain('name');
    });

    it('should handle empty allow array as no restriction', () => {
      const result = service.getAllowedColumns(service.entityColumns, { allow: [] });
      expect(result).toEqual(service.entityColumns);
    });

    it('should handle empty exclude array as no restriction', () => {
      const result = service.getAllowedColumns(service.entityColumns, { exclude: [] });
      expect(result).toEqual(service.entityColumns);
    });
  });

  describe('#tableName', () => {
    it('should return the table name', () => {
      expect(service.tableName).toBe('test_users');
    });
  });

  describe('#getSoftDeleteColumnName', () => {
    it('should return the soft delete column name', () => {
      expect(service.getSoftDeleteColumnName()).toBe('deletedAt');
    });
  });
});
