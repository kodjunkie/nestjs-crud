import { DrizzleCrudService } from '../src/drizzle-crud.service';
import { pgTable, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

const testTable = pgTable('test_users', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  age: integer('age'),
  email: varchar('email', { length: 255 }),
  isActive: boolean('is_active'),
  deletedAt: timestamp('deleted_at'),
});

describe('DrizzleCrudService', () => {
  let service: any;

  beforeEach(() => {
    service = Object.create(DrizzleCrudService.prototype);
    service.table = testTable;
    service.relationsConfig = {};
    service.relationsHash = new Map();
    service.dbDialect = 'pg';
    service.sqlInjectionRegEx = [
      /(%27)|(\')|(--)|(%23)|(#)/gi,
      /((%3D)|(=))[^\n]*((%27)|(\')|(--)|(%3B)|(;))/gi,
      /w*((%27)|(\'))((%6F)|o|(%4F))((%72)|r|(%52))/gi,
      /((%27)|(\'))union/gi,
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
      expect(service.softDeleteColumn).toBeDefined();
    });

    it('should build columnsMap', () => {
      expect(service.columnsMap).toBeDefined();
      expect(service.columnsMap.id).toBeDefined();
      expect(service.columnsMap.name).toBeDefined();
    });

    it('should not detect soft delete on table without deletedAt', () => {
      const noDeleteTable = pgTable('no_delete', {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }),
      });
      const svc: any = Object.create(DrizzleCrudService.prototype);
      svc.table = noDeleteTable;
      svc.entityHasDeleteColumn = false;
      svc.softDeleteColumn = null;
      svc.onInitMapEntityColumns();
      expect(svc.entityHasDeleteColumn).toBe(false);
      expect(svc.softDeleteColumn).toBeNull();
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
      expect(result).toBeDefined();
    });

    it('should handle null value (isNull)', () => {
      const result = service.buildSearchCondition({ name: null });
      expect(result).toBeDefined();
    });

    it('should handle operator object', () => {
      const result = service.buildSearchCondition({ age: { $gt: 18 } });
      expect(result).toBeDefined();
    });

    it('should handle multiple operators on same field', () => {
      const result = service.buildSearchCondition({ age: { $gt: 18, $lt: 65 } });
      expect(result).toBeDefined();
    });

    it('should handle $and conditions', () => {
      const result = service.buildSearchCondition({
        $and: [{ name: 'John' }, { age: { $gt: 18 } }],
      });
      expect(result).toBeDefined();
    });

    it('should handle $or conditions', () => {
      const result = service.buildSearchCondition({
        $or: [{ name: 'John' }, { name: 'Jane' }],
      });
      expect(result).toBeDefined();
    });

    it('should handle nested $and and $or', () => {
      const result = service.buildSearchCondition({
        $and: [{ $or: [{ name: 'John' }, { name: 'Jane' }] }, { age: { $gte: 18 } }],
      });
      expect(result).toBeDefined();
    });

    it('should handle multiple plain fields (implicit AND)', () => {
      const result = service.buildSearchCondition({ name: 'John', age: 25 });
      expect(result).toBeDefined();
    });

    it('should ignore unknown fields', () => {
      const result = service.buildSearchCondition({ unknownField: 'value' });
      expect(result).toBeUndefined();
    });

    it('should handle single $and element', () => {
      const result = service.buildSearchCondition({
        $and: [{ name: 'John' }],
      });
      expect(result).toBeDefined();
    });

    it('should handle single $or element', () => {
      const result = service.buildSearchCondition({
        $or: [{ name: 'John' }],
      });
      expect(result).toBeDefined();
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
      // Empty array is not "isArrayFull", so falls through to plain field handling
      // $and is not a real column, so buildFieldCondition returns undefined
      expect(result).toBeUndefined();
    });

    it('should handle empty $or array', () => {
      const result = service.buildSearchCondition({ $or: [] });
      expect(result).toBeUndefined();
    });

    it('should handle field with $or operator value', () => {
      const result = service.buildSearchCondition({
        name: { $or: { $cont: 'John', $starts: 'Ja' } },
      });
      expect(result).toBeDefined();
    });

    it('should handle $between operator', () => {
      const result = service.buildSearchCondition({ age: { $between: [18, 65] } });
      expect(result).toBeDefined();
    });

    it('should handle $in operator', () => {
      const result = service.buildSearchCondition({ name: { $in: ['John', 'Jane'] } });
      expect(result).toBeDefined();
    });

    it('should handle $isnull operator', () => {
      const result = service.buildSearchCondition({ deletedAt: { $isnull: true } });
      expect(result).toBeDefined();
    });

    it('should handle $cont (like) operator', () => {
      const result = service.buildSearchCondition({ name: { $cont: 'oh' } });
      expect(result).toBeDefined();
    });
  });

  describe('#getSelect', () => {
    it('should return all columns when no restrictions', () => {
      const result = service.getSelect({ fields: [] }, {});
      const keys = Object.keys(result);
      expect(keys.length).toBe(6);
      expect(keys).toContain('id');
      expect(keys).toContain('name');
      expect(keys).toContain('age');
      expect(keys).toContain('email');
      expect(keys).toContain('isActive');
      expect(keys).toContain('deletedAt');
    });

    it('should filter by allowed columns', () => {
      const result = service.getSelect({ fields: [] }, { allow: ['name', 'email'] });
      const keys = Object.keys(result);
      expect(keys).toContain('name');
      expect(keys).toContain('email');
      // Primary key always included
      expect(keys).toContain('id');
    });

    it('should exclude columns', () => {
      const result = service.getSelect({ fields: [] }, { exclude: ['deletedAt'] });
      expect(Object.keys(result)).not.toContain('deletedAt');
    });

    it('should respect query fields', () => {
      const result = service.getSelect({ fields: ['name', 'age'] }, {});
      const keys = Object.keys(result);
      expect(keys).toContain('name');
      expect(keys).toContain('age');
      expect(keys).toContain('id'); // PK always included
    });

    it('should persist specified columns', () => {
      const result = service.getSelect({ fields: ['name'] }, { persist: ['email'] });
      const keys = Object.keys(result);
      expect(keys).toContain('name');
      expect(keys).toContain('email');
      expect(keys).toContain('id');
    });

    it('should not include non-existent columns', () => {
      const result = service.getSelect({ fields: ['nonExistent'] }, {});
      // nonExistent is not in entityColumns, so it's filtered out by getAllowedColumns
      // Only PK should be present
      expect(Object.keys(result)).toContain('id');
      expect(Object.keys(result)).not.toContain('nonExistent');
    });

    it('should combine allow and exclude', () => {
      const result = service.getSelect({ fields: [] }, { allow: ['name', 'email', 'age'], exclude: ['age'] });
      const keys = Object.keys(result);
      expect(keys).toContain('name');
      expect(keys).toContain('email');
      expect(keys).not.toContain('age');
      expect(keys).toContain('id'); // PK always present
    });

    it('should include PK even when query fields do not list it', () => {
      const result = service.getSelect({ fields: ['name'] }, {});
      expect(Object.keys(result)).toContain('id');
    });
  });

  describe('#getSoftDeleteCondition', () => {
    it('should return condition when soft delete column exists', () => {
      const result = service.getSoftDeleteCondition();
      expect(result).toBeDefined();
    });

    it('should return undefined when no soft delete column', () => {
      service.entityHasDeleteColumn = false;
      service.softDeleteColumn = null;
      const result = service.getSoftDeleteCondition();
      expect(result).toBeUndefined();
    });

    it('should return undefined when entityHasDeleteColumn is false', () => {
      service.entityHasDeleteColumn = false;
      const result = service.getSoftDeleteCondition();
      expect(result).toBeUndefined();
    });
  });

  describe('#buildPrimaryKeyCondition', () => {
    it('should build PK condition for single PK', () => {
      const result = service.buildPrimaryKeyCondition({ id: 1 });
      expect(result).toBeDefined();
    });

    it('should build PK condition for numeric value', () => {
      const result = service.buildPrimaryKeyCondition({ id: 42 });
      expect(result).toBeDefined();
    });
  });

  describe('#getSort', () => {
    it('should return empty for no sorts', () => {
      const result = service.getSort({ sort: [] }, {});
      expect(result).toEqual([]);
    });

    it('should handle query sort ASC', () => {
      const result = service.getSort({ sort: [{ field: 'name', order: 'ASC' }] }, {});
      expect(result.length).toBe(1);
    });

    it('should handle DESC sort', () => {
      const result = service.getSort({ sort: [{ field: 'name', order: 'DESC' }] }, {});
      expect(result.length).toBe(1);
    });

    it('should fall back to options sort', () => {
      const result = service.getSort({ sort: [] }, { sort: [{ field: 'id', order: 'ASC' }] });
      expect(result.length).toBe(1);
    });

    it('should skip unknown fields', () => {
      const result = service.getSort({ sort: [{ field: 'unknown', order: 'ASC' }] }, {});
      expect(result.length).toBe(0);
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
      expect(result.length).toBe(2);
    });

    it('should prefer query sort over options sort', () => {
      const result = service.getSort(
        { sort: [{ field: 'name', order: 'ASC' }] },
        { sort: [{ field: 'id', order: 'DESC' }] },
      );
      // Query sort takes precedence
      expect(result.length).toBe(1);
    });

    it('should return empty when both query and options sorts are empty', () => {
      const result = service.getSort({ sort: [] }, { sort: [] });
      expect(result).toEqual([]);
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

    it('should be triggered via buildFieldCondition for valid columns', () => {
      // buildFieldCondition calls checkSqlInjection only after column is found
      // For a valid column name, no throw expected
      expect(() => service.buildFieldCondition('name', 'John')).not.toThrow();
    });

    it('should return undefined from buildFieldCondition for unknown columns', () => {
      // Unknown column returns undefined before reaching SQL injection check
      const result = service.buildFieldCondition('doesNotExist', 'value');
      expect(result).toBeUndefined();
    });
  });

  describe('#getColumn', () => {
    it('should return column for existing field', () => {
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
      const result = service.getAllowedColumns(service.entityColumns, {
        allow: ['name', 'email'],
      });
      expect(result).toContain('name');
      expect(result).toContain('email');
      expect(result).not.toContain('age');
    });

    it('should filter by exclude list', () => {
      const result = service.getAllowedColumns(service.entityColumns, {
        exclude: ['deletedAt'],
      });
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
      const result = service.getSoftDeleteColumnName();
      expect(result).toBe('deletedAt');
    });
  });
});
