import * as fs from 'fs';
import * as path from 'path';
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
    service.sqlInjectionRegEx = [
      /(%27)|(\')|(--)|(%23)|(#)/i,
      /((%3D)|(=))[^\n]*((%27)|(\')|(--)|(%3B)|(;))/i,
      /w*((%27)|(\'))((%6F)|o|(%4F))((%72)|r|(%52))/i,
      /((%27)|(\'))union/i,
    ];
    service.onInitMapEntityColumns();
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

  describe('sqlInjectionRegEx parity (QUALITY-03)', () => {
    // Parity verified against packages/drizzle/src/drizzle-crud.service.ts and
    // packages/typeorm/src/typeorm-crud.service.ts. Guards against /g or /gi
    // re-introduction which would cause stateful .test() lastIndex bugs on
    // repeat calls with the same input (QUALITY-02).
    const sourcePath = path.resolve(__dirname, '../src/mikro-orm-crud.service.ts');
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const arrayMatch = source.match(/sqlInjectionRegEx:\s*RegExp\[\]\s*=\s*\[([\s\S]*?)\];/);

    it('should find the sqlInjectionRegEx array in source', () => {
      expect(arrayMatch).not.toBeNull();
    });

    it('should have no /g flag on any entry (regression guard)', () => {
      const body = arrayMatch![1];
      expect(body).not.toMatch(/\/gi\b/);
      expect(body).not.toMatch(/\/g\b/);
    });

    it('should have no /y (sticky) flag on any entry', () => {
      const body = arrayMatch![1];
      expect(body).not.toMatch(/\/y\b/);
      expect(body).not.toMatch(/\/[a-z]*y[a-z]*,/);
    });

    it('should have /i flag on all four entries', () => {
      const body = arrayMatch![1];
      const flagTokens = body.match(/\/[a-z]+,/g) || [];
      expect(flagTokens.length).toBe(4);
      flagTokens.forEach((token) => expect(token).toContain('i'));
    });
  });

  describe('#getSelect', () => {
    it('should return all columns when no restrictions', () => {
      const result = service.getSelect({ fields: [] }, {});
      expect(result).toContain('id');
      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result.length).toBe(6);
    });

    it('should filter by allowed columns', () => {
      const result = service.getSelect({ fields: [] }, { allow: ['name', 'email'] });
      expect(result).toContain('name');
      expect(result).toContain('email');
      expect(result).toContain('id');
    });

    it('should exclude columns', () => {
      const result = service.getSelect({ fields: [] }, { exclude: ['deletedAt'] });
      expect(result).not.toContain('deletedAt');
    });

    it('should respect query fields', () => {
      const result = service.getSelect({ fields: ['name', 'age'] }, {});
      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result).toContain('id');
    });

    it('should persist specified columns', () => {
      const result = service.getSelect({ fields: ['name'] }, { persist: ['email'] });
      expect(result).toContain('name');
      expect(result).toContain('email');
      expect(result).toContain('id');
    });

    it('should include PK even when query fields do not list it', () => {
      const result = service.getSelect({ fields: ['name'] }, {});
      expect(result).toContain('id');
    });
  });

  describe('#getSort', () => {
    it('should return empty for no sorts', () => {
      const result = service.getSort({ sort: [] }, {});
      expect(result).toEqual({});
    });

    it('should handle query sort ASC', () => {
      const result = service.getSort({ sort: [{ field: 'name', order: 'ASC' }] }, {});
      expect(result).toEqual({ name: 'ASC' });
    });

    it('should handle DESC sort', () => {
      const result = service.getSort({ sort: [{ field: 'name', order: 'DESC' }] }, {});
      expect(result).toEqual({ name: 'DESC' });
    });

    it('should fall back to options sort', () => {
      const result = service.getSort({ sort: [] }, { sort: [{ field: 'id', order: 'ASC' }] });
      expect(result).toEqual({ id: 'ASC' });
    });

    it('should skip unknown fields', () => {
      const result = service.getSort({ sort: [{ field: 'unknown', order: 'ASC' }] }, {});
      expect(result).toEqual({});
    });

    it('should handle multiple sort fields', () => {
      const result = service.getSort(
        {
          sort: [
            { field: 'name', order: 'ASC' },
            { field: 'age', order: 'DESC' },
          ],
        },
        {},
      );
      expect(result).toEqual({ name: 'ASC', age: 'DESC' });
    });
  });

  describe('#getSoftDeleteCondition', () => {
    it('should return condition when soft delete column exists', () => {
      const result = service.getSoftDeleteCondition();
      expect(result).toBeDefined();
      expect(result).toEqual({ deletedAt: null });
    });

    it('should return undefined when no soft delete column', () => {
      service.entityHasDeleteColumn = false;
      service.softDeleteColumn = null;
      const result = service.getSoftDeleteCondition();
      expect(result).toBeUndefined();
    });
  });

  describe('#buildPrimaryKeyCondition', () => {
    it('should build PK condition for single PK', () => {
      const result = service.buildPrimaryKeyCondition({ id: 1 });
      expect(result).toEqual({ id: 1 });
    });

    it('should build PK condition for composite PK', () => {
      service.entityPrimaryColumns = ['id', 'tenantId'];
      const result = service.buildPrimaryKeyCondition({ id: 1, tenantId: 'abc' });
      expect(result).toEqual({ id: 1, tenantId: 'abc' });
    });
  });

  describe('#buildSearchCondition', () => {
    it('should return undefined for empty search', () => {
      expect(service.buildSearchCondition({})).toBeUndefined();
    });

    it('should return undefined for null search', () => {
      expect(service.buildSearchCondition(null)).toBeUndefined();
    });

    it('should return undefined for undefined search', () => {
      expect(service.buildSearchCondition(undefined)).toBeUndefined();
    });

    it('should handle simple equality', () => {
      const result = service.buildSearchCondition({ name: 'John' });
      expect(result).toEqual({ name: 'John' });
    });

    it('should handle null value', () => {
      const result = service.buildSearchCondition({ name: null });
      expect(result).toEqual({ name: null });
    });

    it('should handle operator object', () => {
      const result = service.buildSearchCondition({ age: { $gt: 18 } });
      expect(result).toEqual({ age: { $gt: 18 } });
    });

    it('should handle multiple operators on same field', () => {
      const result = service.buildSearchCondition({ age: { $gt: 18, $lt: 65 } });
      expect(result).toEqual({ age: { $gt: 18, $lt: 65 } });
    });

    it('should handle $and conditions', () => {
      const result = service.buildSearchCondition({
        $and: [{ name: 'John' }, { age: { $gt: 18 } }],
      });
      expect(result).toEqual({ $and: [{ name: 'John' }, { age: { $gt: 18 } }] });
    });

    it('should handle $or conditions', () => {
      const result = service.buildSearchCondition({
        $or: [{ name: 'John' }, { name: 'Jane' }],
      });
      expect(result).toEqual({ $or: [{ name: 'John' }, { name: 'Jane' }] });
    });

    it('should handle nested $and and $or', () => {
      const result = service.buildSearchCondition({
        $and: [{ $or: [{ name: 'John' }, { name: 'Jane' }] }, { age: { $gte: 18 } }],
      });
      expect(result).toBeDefined();
      expect(result.$and).toBeDefined();
    });

    it('should handle multiple plain fields (implicit AND)', () => {
      const result = service.buildSearchCondition({ name: 'John', age: 25 });
      expect(result).toEqual({ name: 'John', age: 25 });
    });

    it('should ignore unknown fields', () => {
      const result = service.buildSearchCondition({ unknownField: 'value' });
      expect(result).toBeUndefined();
    });

    it('should handle $or mixed with other fields', () => {
      const result = service.buildSearchCondition({
        $or: [{ name: 'John' }, { name: 'Jane' }],
        age: { $gte: 18 },
      });
      expect(result).toBeDefined();
    });

    it('should handle empty $and array', () => {
      const result = service.buildSearchCondition({ $and: [] });
      expect(result).toBeUndefined();
    });

    it('should handle empty $or array', () => {
      const result = service.buildSearchCondition({ $or: [] });
      expect(result).toBeUndefined();
    });

    it('should handle $cont operator', () => {
      const result = service.buildSearchCondition({ name: { $cont: 'oh' } });
      expect(result).toEqual({ name: { $like: '%oh%' } });
    });

    it('should handle $between operator', () => {
      const result = service.buildSearchCondition({ age: { $between: [18, 65] } });
      expect(result).toEqual({ age: { $gte: 18, $lte: 65 } });
    });

    it('should handle $in operator', () => {
      const result = service.buildSearchCondition({ name: { $in: ['John', 'Jane'] } });
      expect(result).toEqual({ name: { $in: ['John', 'Jane'] } });
    });

    it('should handle $isnull operator', () => {
      const result = service.buildSearchCondition({ deletedAt: { $isnull: true } });
      expect(result).toEqual({ deletedAt: null });
    });

    it('should handle field with $or operator value', () => {
      const result = service.buildSearchCondition({
        name: { $or: { $cont: 'John', $starts: 'Ja' } },
      });
      expect(result).toBeDefined();
    });
  });

  describe('SQL injection detection', () => {
    it('should throw on SQL injection with single quote and comment', () => {
      expect(() => service['checkSqlInjection']("name'--")).toThrow();
    });

    it('should throw on union injection', () => {
      expect(() => service['checkSqlInjection']("'union")).toThrow();
    });

    it('should throw on hash comment injection', () => {
      expect(() => service['checkSqlInjection']('field#')).toThrow();
    });

    it('should throw on encoded single quote', () => {
      expect(() => service['checkSqlInjection']('field%27')).toThrow();
    });

    it('should allow safe field names', () => {
      expect(() => service['checkSqlInjection']('name')).not.toThrow();
      expect(() => service['checkSqlInjection']('age')).not.toThrow();
      expect(() => service['checkSqlInjection']('isActive')).not.toThrow();
    });

    it('should return the field name for safe fields', () => {
      expect(service['checkSqlInjection']('name')).toBe('name');
    });
  });

  describe('#getColumn', () => {
    it('should return property for existing field', () => {
      expect(service.getColumn('id')).toBeDefined();
      expect(service.getColumn('name')).toBeDefined();
    });

    it('should return undefined for non-existing field', () => {
      expect(service.getColumn('nonExistent')).toBeUndefined();
    });
  });

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
