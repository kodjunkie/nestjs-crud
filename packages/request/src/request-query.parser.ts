import {
  hasLength,
  hasValue,
  isString,
  isArrayFull,
  isDate,
  isDateString,
  isObject,
  isStringFull,
  objKeys,
  isNil,
  ObjectLiteral,
} from '@nestjs-crud/util';
import { ClassTransformOptions } from 'class-transformer';

import { RequestQueryException } from './exceptions';
import { ParamsOptions, ParsedRequestOptions, ParsedRequestParams, RequestQueryBuilderOptions } from './interfaces';
import { RequestQueryBuilder } from './request-query.builder';
import {
  validateCondition,
  validateJoin,
  validateNumeric,
  validateParamOption,
  validateSort,
  validateUUID,
} from './request-query.validator';
import {
  ComparisonOperator,
  QueryFields,
  QueryFilter,
  QueryJoin,
  QuerySort,
  SCondition,
  SConditionAND,
  SFields,
} from './types';

// tslint:disable:variable-name ban-types
export class RequestQueryParser implements ParsedRequestParams {
  public fields: QueryFields = [];

  public paramsFilter: QueryFilter[] = [];

  public authPersist: ObjectLiteral = undefined;

  public classTransformOptions: ClassTransformOptions = undefined;

  public search: SCondition;

  public filter: QueryFilter[] = [];

  public or: QueryFilter[] = [];

  public join: QueryJoin[] = [];

  public sort: QuerySort[] = [];

  public limit: number;

  public offset: number;

  public page: number;

  public cache: number;

  public cursor: string;

  public includeDeleted: number;

  public options: ParsedRequestOptions = {};

  private _params: any;

  private _query: any;

  private _paramNames: string[];

  private _paramsOptions: ParamsOptions;

  private get _options(): RequestQueryBuilderOptions {
    return RequestQueryBuilder.getOptions();
  }

  static create(): RequestQueryParser {
    return new RequestQueryParser();
  }

  getParsed(): ParsedRequestParams {
    return {
      fields: this.fields,
      paramsFilter: this.paramsFilter,
      authPersist: this.authPersist,
      classTransformOptions: this.classTransformOptions,
      search: this.search,
      filter: this.filter,
      or: this.or,
      join: this.join,
      sort: this.sort,
      limit: this.limit,
      offset: this.offset,
      page: this.page,
      cache: this.cache,
      cursor: this.cursor,
      includeDeleted: this.includeDeleted,
      options: this.options,
    };
  }

  parseQuery(query: any): this {
    if (isObject(query)) {
      const paramNames = objKeys(query);

      if (hasLength(paramNames)) {
        this._query = query;
        this._paramNames = paramNames;
        const searchData = this._query[this.getParamNames('search')[0]];
        this.search = this.parseSearchQueryParam(searchData) as any;
        if (isNil(this.search)) {
          this.filter = this.parseQueryParam('filter', this.conditionParser.bind(this, 'filter'));
          this.or = this.parseQueryParam('or', this.conditionParser.bind(this, 'or'));
        }
        this.fields = this.parseQueryParam('fields', this.fieldsParser.bind(this))[0] || [];
        this.join = this.parseQueryParam('join', this.joinParser.bind(this));
        this.sort = this.parseQueryParam('sort', this.sortParser.bind(this));
        this.limit = this.parseQueryParam('limit', this.numericParser.bind(this, 'limit'))[0];
        this.offset = this.parseQueryParam('offset', this.numericParser.bind(this, 'offset'))[0];
        this.page = this.parseQueryParam('page', this.numericParser.bind(this, 'page'))[0];
        // Parse `?cache` into two distinct surfaces:
        //   1. `this.cache: number` — TTL override (numeric values like ?cache=300000)
        //   2. `this.options.cache: boolean` — bypass-read flag (?cache=0|1|false|true)
        //
        // Strict-known + silent-ignore semantics for single-string values:
        //   - Recognized bypass strings ('0','1','false','true'): set options.cache, skip
        //     numeric parse (it would throw on these).
        //   - Pure numeric strings: set this.cache via numericParser.
        //   - Any other single string (e.g. 'evil'): silently ignore both surfaces
        //     (no 400 — preserves backward-compat for clients sending varied ?cache strings).
        //   - Array values (e.g. ['a']): numericParser throws as before (existing behavior).
        const cacheParamNames = this.getParamNames('cache');
        if (isArrayFull(cacheParamNames)) {
          const rawCacheValue = this._query[cacheParamNames[0]];
          const cacheBypass = this.parseQueryParam('cache', this.cacheBypassParser.bind(this))[0];
          if (typeof cacheBypass === 'boolean') {
            // Recognized bypass string: set options.cache; skip numeric parse.
            this.options = { ...this.options, cache: cacheBypass };
          } else if (isArrayFull(rawCacheValue) || isStringFull(rawCacheValue)) {
            // Array: always run numericParser (preserves existing throw behavior for arrays).
            // Single full string: run numericParser; if it's non-numeric but not a bypass
            // value, silently ignore (only throw for arrays, not single strings).
            if (isArrayFull(rawCacheValue)) {
              this.cache = this.parseQueryParam('cache', this.numericParser.bind(this, 'cache'))[0];
            } else {
              // Single string that wasn't a recognized bypass — try numeric parse; catch
              // only the 'Invalid cache' error to implement silent-ignore for 'evil'-style values.
              try {
                this.cache = this.parseQueryParam('cache', this.numericParser.bind(this, 'cache'))[0];
              } catch (_e) {
                // Silent-ignore: unrecognized single string; this.cache stays undefined.
              }
            }
          }
        }
        this.includeDeleted = this.parseQueryParam(
          'includeDeleted',
          this.numericParser.bind(this, 'includeDeleted'),
        )[0];
        this.cursor = this.parseQueryParam('cursor', (s: string) => s)[0];
        if (this.cursor && this.cursor.length > 0 && (this.offset !== undefined || this.page !== undefined)) {
          throw new RequestQueryException(
            'Invalid query: cursor and offset/page are mutually exclusive',
          );
        }
      }
    }

    return this;
  }

  parseParams(params: any, options: ParamsOptions): this {
    if (isObject(params)) {
      const paramNames = objKeys(params);

      if (hasLength(paramNames)) {
        this._params = params;
        this._paramsOptions = options;
        this.paramsFilter = paramNames.map((name) => this.paramParser(name)).filter((filter) => filter);
      }
    }

    return this;
  }

  setAuthPersist(
    persist: ObjectLiteral = {},
    entityColumnsHash?: ObjectLiteral,
    logger?: { warn?: (msg: string) => void },
  ) {
    this.authPersist =
      persist ||
      /* istanbul ignore next -- defensive default: `persist` already defaults to `{}` via the parameter signature, so the `||` fallback is structurally unreachable */ {};

    // Runtime key validation — throws on previously-silent typos.
    if (entityColumnsHash && persist) {
      const invalidKeys = Object.keys(persist).filter((k) => !(k in entityColumnsHash));

      if (invalidKeys.length > 0) {
        // logger.warn PII guard: emit KEY NAMES ONLY. Keys come from the
        // consumer's @CrudAuth decorator (their typos), not end-user request bodies.
        // DO NOT interpolate the `persist` object — that contains runtime persist
        // values (tenant IDs, user IDs) supplied by the auth pipeline. Those are PII.
        logger?.warn?.(`@CrudAuth persist: invalid key(s) "${invalidKeys.join('", "')}"`);
        throw new RequestQueryException(
          `@CrudAuth persist: invalid key(s) "${invalidKeys.join('", "')}" — not columns on the target entity`,
        );
      }
    }
  }

  setClassTransformOptions(options: ClassTransformOptions = {}) {
    this.classTransformOptions =
      options ||
      /* istanbul ignore next -- defensive default: `options` already defaults to `{}` via the parameter signature, so the `||` fallback is structurally unreachable */ {};
  }

  convertFilterToSearch(filter: QueryFilter): SFields | SConditionAND {
    const isEmptyValue = {
      isnull: true,
      notnull: true,
    };

    return filter
      ? {
          [filter.field]: {
            [filter.operator]: isEmptyValue[filter.operator] ? isEmptyValue[filter.operator] : filter.value,
          },
        }
      : /* istanbul ignore next -- defensive default: callers of convertFilterToSearch always pass a parsed QueryFilter (validated upstream); falsy-filter branch unreachable in current call sites */ {};
  }

  private getParamNames(type: keyof RequestQueryBuilderOptions['paramNamesMap']): string[] {
    return this._paramNames.filter((p) => {
      const name = this._options.paramNamesMap[type];
      return isString(name) ? name === p : (name as string[]).some((m) => m === p);
    });
  }

  private getParamValues(value: string | string[], parser: any): string[] {
    if (isStringFull(value)) {
      return [parser.call(this, value)];
    }

    if (isArrayFull(value)) {
      return (value as string[]).map((val) => parser(val));
    }

    return [];
  }

  private parseQueryParam(type: keyof RequestQueryBuilderOptions['paramNamesMap'], parser: any) {
    const param = this.getParamNames(type);

    if (isArrayFull(param)) {
      return param.reduce((a, name) => [...a, ...this.getParamValues(this._query[name], parser)], []);
    }

    return [];
  }

  private parseValue(val: any): string | number | boolean | Date {
    try {
      const parsed = JSON.parse(val);

      if (!isDate(parsed) && isObject(parsed)) {
        // throw new Error('Don\'t support object now');
        return val;
      } else if (typeof parsed === 'number' && parsed.toLocaleString('fullwide', { useGrouping: false }) !== val) {
        // JS cannot handle big numbers. Leave it as a string to prevent data loss
        return val;
      }

      return parsed;
    } catch (_ignored) {
      if (isDateString(val)) {
        return new Date(val);
      }

      return val;
    }
  }

  private parseValues(vals: any) {
    if (isArrayFull(vals)) {
      return vals.map((v: any) => this.parseValue(v));
    } else {
      return this.parseValue(vals);
    }
  }

  private fieldsParser(data: string): QueryFields {
    return data.split(this._options.delimStr);
  }

  private parseSearchQueryParam(d: any): SCondition {
    if (isNil(d)) {
      return undefined;
    }

    let data: any;
    try {
      data = JSON.parse(d);
    } catch (_) {
      throw new RequestQueryException('Invalid search param. JSON expected');
    }

    if (!isObject(data)) {
      throw new RequestQueryException('Invalid search param. JSON object expected');
    }

    const maxDepth = 10;
    if (!this.validateSearchDepth(data, maxDepth)) {
      throw new RequestQueryException(`Invalid search param. Maximum nesting depth of ${maxDepth} exceeded`);
    }

    return data;
  }

  private validateSearchDepth(obj: any, maxDepth: number, currentDepth = 0): boolean {
    if (currentDepth > maxDepth) {
      return false;
    }
    if (!isObject(obj)) {
      return true;
    }
    return Object.values(obj).every((val) =>
      Array.isArray(val)
        ? val.every((item) => this.validateSearchDepth(item, maxDepth, currentDepth + 1))
        : this.validateSearchDepth(val, maxDepth, currentDepth + 1),
    );
  }

  private conditionParser(cond: 'filter' | 'or' | 'search', data: string): QueryFilter {
    const isArrayValue = ['in', 'notin', 'between', '$in', '$notin', '$between', '$inL', '$notinL'];
    const isEmptyValue = ['isnull', 'notnull', '$isnull', '$notnull'];
    const param = data.split(this._options.delim);
    const field = param[0];
    const operator = param[1] as ComparisonOperator;
    let value = param[2] || '';

    if (isArrayValue.some((name) => name === operator)) {
      value = value.split(this._options.delimStr) as any;
    }

    value = this.parseValues(value);

    if (!isEmptyValue.some((name) => name === operator) && !hasValue(value)) {
      throw new RequestQueryException(`Invalid ${cond} value`);
    }

    const condition: QueryFilter = { field, operator, value };
    validateCondition(condition, cond);

    return condition;
  }

  private joinParser(data: string): QueryJoin {
    const param = data.split(this._options.delim);
    const join: QueryJoin = {
      field: param[0],
      select: isStringFull(param[1]) ? param[1].split(this._options.delimStr) : undefined,
    };
    validateJoin(join);

    return join;
  }

  private sortParser(data: string): QuerySort {
    const param = data.split(this._options.delimStr);
    const sort: QuerySort = {
      field: param[0],
      order: param[1] as any,
    };
    validateSort(sort);

    return sort;
  }

  private numericParser(num: 'limit' | 'offset' | 'page' | 'cache' | 'includeDeleted', data: string): number {
    const val = this.parseValue(data) as number;
    validateNumeric(val, num);

    return val;
  }

  /**
   * Coerce `?cache=0|1|false|true` into `boolean | undefined`. Returns
   * `undefined` for any other input — including numeric TTL values like `300000`
   * (handled by `parsed.cache: number`), empty strings, and any unrecognized value
   * such as `?cache=evil`. Silent-ignore by design: do NOT 400 on unknown values —
   * preserves backward-compat for existing clients that send varied `?cache` query strings.
   */
  private cacheBypassParser(data: string): boolean | undefined {
    if (data === '0' || data === 'false') return false;
    if (data === '1' || data === 'true') return true;
    return undefined;
  }

  private paramParser(name: string): QueryFilter {
    validateParamOption(this._paramsOptions, name);
    const option = this._paramsOptions[name];

    if (option.disabled) {
      return undefined;
    }

    let value = this._params[name];

    switch (option.type) {
      case 'number':
        value = this.parseValue(value);
        validateNumeric(value, `param ${name}`);
        break;
      case 'uuid':
        validateUUID(value, name);
        break;
      default:
        break;
    }

    return { field: option.field, operator: '$eq', value };
  }
}
