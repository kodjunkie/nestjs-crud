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

// Phase 6 Plan 04 scope-narrow: the service no longer owns
// `buildSearchCondition` / `buildFieldCondition` / `getSort` / `applyJoins` /
// `getSelect` / `getSoftDeleteCondition` / `getColumn` — those moved to
// `DrizzleQueryTranslator` + `DrizzleJoinResolver` (Plan 03). Plan 05 adds
// class-level specs on the extracted classes. This file retains only the
// describe blocks that still exercise live surface on `DrizzleCrudService`.
describe('DrizzleCrudService', () => {
  let service: any;

  beforeEach(() => {
    service = Object.create(DrizzleCrudService.prototype);
    service.table = testTable;
    service.relationsConfig = {};
    service.dbDialect = 'pg';
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

  describe('#getAllowedColumns (inherited from CrudService)', () => {
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
