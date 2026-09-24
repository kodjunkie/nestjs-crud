import 'reflect-metadata';
import { Controller } from '@nestjs/common';

import { Crud } from '../src/decorators';
import { CrudConfigService } from '../src/module/crud-config.service';
import {
  DEFAULT_QUERY_DOCS_URL,
  describeQueryDocsUrlValue,
  isValidQueryDocsUrl,
  queryDocsLine,
} from '../src/crud/swagger/query-docs-url';
import { TestModel } from './__fixture__/models';

describe('queryDocsUrl', () => {
  afterEach(() => CrudConfigService.reset());

  describe('module shape', () => {
    it('exports the default wiki URL and a matching link builder', () => {
      expect(DEFAULT_QUERY_DOCS_URL).toBe('https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax');
      expect(queryDocsLine(DEFAULT_QUERY_DOCS_URL)).toBe(
        `Full query syntax reference: [Query Syntax](${DEFAULT_QUERY_DOCS_URL}).`,
      );
    });
  });

  describe('isValidQueryDocsUrl — predicate table', () => {
    const validCases: Array<[string, unknown]> = [
      ['false', false],
      ['http URL', 'http://docs.example.com'],
      ['https URL with query and fragment', 'https://docs.example.com/query-syntax?x=1#y'],
      ['uppercase scheme', 'HTTPS://docs.example.com'],
    ];

    it.each(validCases)('valid: %s', (_label, value) => {
      expect(isValidQueryDocsUrl(value)).toBe(true);
    });

    const invalidCases: Array<[string, unknown]> = [
      ['empty string', ''],
      ['whitespace only', ' '],
      ['leading whitespace', ' https://docs.example.com'],
      ['embedded whitespace', 'https://docs.example.com/a b'],
      ['non-http(s) scheme (ftp)', 'ftp://docs.example.com'],
      ['non-http(s) scheme (javascript)', 'javascript:alert(1)'],
      ['relative path', '/docs/query'],
      ['bare host', 'docs.example.com'],
      ['scheme with no host', 'https://'],
      ['single-colon scheme (no host prefix match)', 'https:docs.example.com'],
      ['boolean true', true],
      ['number', 0],
      ['null', null],
      ['plain object', {}],
    ];

    it.each(invalidCases)('invalid: %s', (_label, value) => {
      expect(isValidQueryDocsUrl(value)).toBe(false);
    });
  });

  describe('describeQueryDocsUrlValue', () => {
    it('quotes strings', () => {
      expect(describeQueryDocsUrlValue('https://docs.example.com/a b')).toBe('"https://docs.example.com/a b"');
    });

    it('stringifies non-string values', () => {
      expect(describeQueryDocsUrlValue(true)).toBe('true');
      expect(describeQueryDocsUrlValue(0)).toBe('0');
      expect(describeQueryDocsUrlValue(null)).toBe('null');
    });

    it('renders objects and arrays as JSON instead of [object Object]', () => {
      expect(describeQueryDocsUrlValue({ url: 'https://docs.example.com' })).toBe('{"url":"https://docs.example.com"}');
      expect(describeQueryDocsUrlValue(['https://docs.example.com'])).toBe('["https://docs.example.com"]');
    });

    it('falls back to String() when JSON.stringify throws', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(describeQueryDocsUrlValue(circular)).toBe('[object Object]');
    });
  });

  describe('route-level throw', () => {
    const invalidValues: Array<[string, unknown]> = [
      ['empty string', ''],
      ['leading whitespace', ' https://docs.example.com'],
      ['non-http(s) scheme', 'javascript:alert(1)'],
      ['relative path', '/docs/query'],
      ['boolean true', true],
      ['number', 0],
      ['null', null],
    ];

    it.each(invalidValues)('throws at @Crud() decoration for %s', (_label, value) => {
      expect(() => {
        @Crud({
          model: { type: TestModel },
          swagger: { queryDocsUrl: value as any },
        })
        @Controller('query-docs-throw-ctrl')
        class QueryDocsThrowCtrl {}
        void QueryDocsThrowCtrl;
      }).toThrow(/^@Crud: swagger\.queryDocsUrl on QueryDocsThrowCtrl /);
    });

    it('does not throw for false', () => {
      expect(() => {
        @Crud({
          model: { type: TestModel },
          swagger: { queryDocsUrl: false },
        })
        @Controller('query-docs-false-ctrl')
        class QueryDocsFalseCtrl {}
        void QueryDocsFalseCtrl;
      }).not.toThrow();
    });

    it('does not throw for undefined (unset)', () => {
      expect(() => {
        @Crud({ model: { type: TestModel } })
        @Controller('query-docs-unset-ctrl')
        class QueryDocsUnsetCtrl {}
        void QueryDocsUnsetCtrl;
      }).not.toThrow();
    });

    it('does not throw for a valid URL', () => {
      expect(() => {
        @Crud({
          model: { type: TestModel },
          swagger: { queryDocsUrl: 'https://docs.example.com' },
        })
        @Controller('query-docs-valid-ctrl')
        class QueryDocsValidCtrl {}
        void QueryDocsValidCtrl;
      }).not.toThrow();
    });
  });

  describe('global-level throw (CrudConfigService.load)', () => {
    const invalidValues: Array<[string, unknown]> = [
      ['empty string', ''],
      ['leading whitespace', ' https://docs.example.com'],
      ['non-http(s) scheme', 'javascript:alert(1)'],
      ['relative path', '/docs/query'],
      ['boolean true', true],
      ['number', 0],
      ['null', null],
    ];

    it.each(invalidValues)('throws for %s and leaves config unchanged', (_label, value) => {
      const before = { ...CrudConfigService.config };

      expect(() => CrudConfigService.load({ swagger: { queryDocsUrl: value as any } })).toThrow(
        /^CrudConfigService\.load: swagger\.queryDocsUrl /,
      );

      expect(CrudConfigService.config).toEqual(before);
    });

    it('does not throw for false', () => {
      expect(() => CrudConfigService.load({ swagger: { queryDocsUrl: false } })).not.toThrow();
    });

    it('does not throw for a valid URL', () => {
      expect(() => CrudConfigService.load({ swagger: { queryDocsUrl: 'https://docs.example.com' } })).not.toThrow();
    });

    it('does not throw when swagger is unset', () => {
      expect(() => CrudConfigService.load({})).not.toThrow();
    });
  });

  describe('global config extra-key handling', () => {
    it('a global swagger object with an extra key stores only queryDocsUrl', () => {
      CrudConfigService.load({
        swagger: { queryDocsUrl: 'https://docs.example.com', tag: 'ignored' } as any,
      });

      expect(CrudConfigService.config.swagger).toEqual({ queryDocsUrl: 'https://docs.example.com' });
    });

    it('does not store the swagger key at all when queryDocsUrl is unset', () => {
      CrudConfigService.load({ swagger: { tag: 'ignored' } as any });

      expect(CrudConfigService.config.swagger).toBeUndefined();
    });
  });
});
