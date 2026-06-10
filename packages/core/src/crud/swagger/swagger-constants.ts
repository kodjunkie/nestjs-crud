/**
 * Single source of truth for `swaggerConst` — the resolved `@nestjs/swagger/dist/constants`
 * module (or a faithful local fallback, or null when swagger is not installed).
 *
 * Three-state resolution (evaluated in order):
 *
 *   1. DEEP REQUIRE (preferred): attempts `@nestjs/swagger/dist/constants` exactly as the
 *      helpers originally did. If the installed version exposes that path (pre-11.4.3 or any
 *      version whose exports map still allows `./dist/*`) the real module is returned verbatim
 *      — future upstream key additions are picked up automatically with zero code changes here.
 *
 *   2. INLINED-LITERAL FALLBACK: recent upstream versions (11.4.3+) added a package `exports`
 *      map that exposes only `.`, `./plugin`, and `./package.json`. That map blocks the
 *      `./dist/constants` deep require with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which `safeRequire`
 *      swallows and returns as null. To distinguish "installed but deep path blocked" from
 *      "genuinely not installed", the root entry (`@nestjs/swagger`) is probed. If it succeeds
 *      but the deep require returned null, a local literal constant object is returned. The
 *      key strings are copied verbatim from `node_modules/@nestjs/swagger/dist/constants.js`
 *      and match the real module exactly — no new runtime dependency is introduced.
 *
 *   3. NULL: when the root `@nestjs/swagger` require is also null the package is genuinely not
 *      installed. Null is exported, and every helper's existing `if (swaggerConst)` guard takes
 *      the graceful-degradation (no-swagger) path unchanged.
 */
import { safeRequire } from '../../util';

/**
 * Shape of `@nestjs/swagger/dist/constants` — the two top-level keys the module exports plus
 * an index signature so callers that historically accessed other properties (e.g. the top-level
 * `API_EXTRA_MODELS` read in `responses.helper.ts`) compile without a type error. The real
 * upstream module has no top-level `API_EXTRA_MODELS`; the index signature resolves to
 * `undefined` at runtime for any key not explicitly present, which is the intended behavior.
 */
export interface SwaggerConstants {
  DECORATORS_PREFIX: string;
  DECORATORS: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Inlined literal fallback that mirrors `@nestjs/swagger/dist/constants.js` exactly.
 * Key strings are built via template literals off the prefix — the same technique used in the
 * upstream source — so any prefix inconsistency would be trivially visible in review.
 * Shape: `{ DECORATORS_PREFIX, DECORATORS }` only.  No top-level `API_EXTRA_MODELS` is added
 * here; the real module has none, and `responses.helper.ts` depends on that absence to return
 * `[]` from `getExtraModels` (latent quirk preserved deliberately — see interface_context note
 * in the plan).
 */
const DECORATORS_PREFIX = 'swagger';
const INLINED_FALLBACK: SwaggerConstants = {
  DECORATORS_PREFIX,
  DECORATORS: {
    API_OPERATION: `${DECORATORS_PREFIX}/apiOperation`,
    API_RESPONSE: `${DECORATORS_PREFIX}/apiResponse`,
    API_PRODUCES: `${DECORATORS_PREFIX}/apiProduces`,
    API_CONSUMES: `${DECORATORS_PREFIX}/apiConsumes`,
    API_TAGS: `${DECORATORS_PREFIX}/apiUseTags`,
    API_WEBHOOK: `${DECORATORS_PREFIX}/apiWebhook`,
    API_CALLBACKS: `${DECORATORS_PREFIX}/apiCallbacks`,
    API_PARAMETERS: `${DECORATORS_PREFIX}/apiParameters`,
    API_HEADERS: `${DECORATORS_PREFIX}/apiHeaders`,
    API_MODEL_PROPERTIES: `${DECORATORS_PREFIX}/apiModelProperties`,
    API_MODEL_PROPERTIES_ARRAY: `${DECORATORS_PREFIX}/apiModelPropertiesArray`,
    API_SECURITY: `${DECORATORS_PREFIX}/apiSecurity`,
    API_EXCLUDE_ENDPOINT: `${DECORATORS_PREFIX}/apiExcludeEndpoint`,
    API_INCLUDE_ENDPOINT: `${DECORATORS_PREFIX}/apiIncludeEndpoint`,
    API_EXCLUDE_CONTROLLER: `${DECORATORS_PREFIX}/apiExcludeController`,
    API_EXTRA_MODELS: `${DECORATORS_PREFIX}/apiExtraModels`,
    API_EXTENSION: `${DECORATORS_PREFIX}/apiExtension`,
    API_SCHEMA: `${DECORATORS_PREFIX}/apiSchema`,
    API_DEFAULT_GETTER: `${DECORATORS_PREFIX}/apiDefaultGetter`,
    API_LINK: `${DECORATORS_PREFIX}/apiLink`,
  },
};

function resolveSwaggerConst(): SwaggerConstants | null {
  // Step 1: attempt the legacy deep require first — wins on older swagger versions whose
  // exports map still allows `./dist/*` or that predate exports maps entirely.
  const deep = safeRequire<SwaggerConstants>(
    '@nestjs/swagger/dist/constants',
    () => require('@nestjs/swagger/dist/constants'),
  );
  if (deep && deep.DECORATORS) {
    return deep;
  }

  // Step 2: deep require returned null — probe the root entry to distinguish causes.
  const root = safeRequire('@nestjs/swagger', () => require('@nestjs/swagger'));
  if (!root) {
    // Root also null → swagger is genuinely not installed.
    return null;
  }

  // Root is non-null but deep path was blocked (exports map scenario).
  // Return the inlined literal fallback so helpers keep emitting swagger metadata.
  return INLINED_FALLBACK;
}

export const swaggerConst = resolveSwaggerConst();
