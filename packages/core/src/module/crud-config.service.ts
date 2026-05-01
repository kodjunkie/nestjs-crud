import { RequestQueryBuilder } from '@nestjs-crud/request';
import { isObjectFull } from '@nestjs-crud/util';
import * as deepmerge from 'deepmerge';

import { CrudGlobalConfig } from '../interfaces';

const DEFAULT_CONFIG: CrudGlobalConfig = {
  auth: {},
  query: {
    alwaysPaginate: false,
    cacheErrorPolicy: 'fail-fast', // preserves current fail-loud behavior by default
  },
  routes: {
    getManyBase: { interceptors: [], decorators: [] },
    getOneBase: { interceptors: [], decorators: [] },
    createOneBase: { interceptors: [], decorators: [], returnShallow: false },
    createManyBase: { interceptors: [], decorators: [] },
    updateOneBase: {
      interceptors: [],
      decorators: [],
      allowParamsOverride: false,
      returnShallow: false,
    },
    replaceOneBase: {
      interceptors: [],
      decorators: [],
      allowParamsOverride: false,
      returnShallow: false,
    },
    deleteOneBase: { interceptors: [], decorators: [], returnDeleted: false },
    recoverOneBase: { interceptors: [], decorators: [], returnRecovered: false },
  },
  params: {},
};

export class CrudConfigService {
  static config: CrudGlobalConfig = deepmerge({}, DEFAULT_CONFIG);

  static load(config: CrudGlobalConfig = {}) {
    if (isObjectFull(config.queryParser)) {
      RequestQueryBuilder.setOptions(config.queryParser);
    }

    const auth = isObjectFull(config.auth) ? config.auth : {};
    const query = isObjectFull(config.query) ? config.query : {};
    const routes = isObjectFull(config.routes) ? config.routes : {};
    const params = isObjectFull(config.params) ? config.params : {};
    const serialize = isObjectFull(config.serialize) ? config.serialize : {};

    CrudConfigService.config = deepmerge(
      CrudConfigService.config,
      {
        auth,
        query,
        routes,
        params,
        serialize,
      },
      {
        arrayMerge: (a, b, _c) => b,
        // Only recursively merge plain objects (prototype === Object.prototype).
        // Class instances (e.g. CacheStrategy implementations) are treated as
        // leaf values and assigned directly — deepmerge would otherwise strip
        // their prototype methods by copying only own enumerable properties.
        isMergeableObject: (val: unknown) =>
          val !== null &&
          typeof val === 'object' &&
          Object.getPrototypeOf(val) === Object.prototype,
      },
    );
  }

  /**
   * Restore the global config to its initial defaults. Required by integration
   * test suites that call `load({ query: { cacheStrategy } })` so subsequent
   * suites do not inherit the previous strategy. NOT for production use.
   *
   * @since 2.2.0
   */
  static reset(): void {
    CrudConfigService.config = deepmerge({}, DEFAULT_CONFIG);
  }
}
