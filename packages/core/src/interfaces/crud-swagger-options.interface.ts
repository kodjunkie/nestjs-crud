import type { ApiOperationOptions } from '@nestjs/swagger';

import { BaseRouteName } from '../types/base-route-name.type';

/**
 * Per-route operation metadata accepted by {@link CrudSwaggerOptions.operations}.
 *
 * Mirrors `@nestjs/swagger`'s `ApiOperationOptions` minus `operationId`. The operationId is
 * computed per-route by the factory (`{verb}{Model}Base`) to preserve OpenAPI uniqueness
 * guarantees across the full emitted document; consumer overrides would reintroduce the
 * duplicate-operationId footgun, so the key is blocked at the type level.
 */
export type CrudSwaggerOperationOptions = Omit<Partial<ApiOperationOptions>, 'operationId'>;

/**
 * Opt-ins that force-emit specific 4xx error responses on every generated route.
 *
 * By default the factory auto-emits a `401 Unauthorized` response only when the controller
 * class is decorated with `@CrudAuth()`. When authentication is enforced by a
 * globally-registered NestJS guard — for example a provider registered with the
 * `APP_GUARD` token — the `@CrudAuth()` marker is absent and the 401 response is skipped
 * from the emitted OpenAPI document. These opt-ins are the escape hatch for that case.
 */
export interface CrudSwaggerErrorResponsesOptions {
  /**
   * Force-emit a `401 Unauthorized` response on every generated route even when the
   * controller is not decorated with `@CrudAuth()`. Set this to `true` when authentication
   * is enforced via a globally-registered guard (e.g. via the `APP_GUARD` provider token)
   * so the emitted OpenAPI document still documents the 401 path. Default: `false`.
   *
   * Without this flag, 401 is auto-emitted only when `@CrudAuth()` is present on the
   * controller class.
   */
  unauthorized?: boolean;
}

/**
 * Consumer-supplied request-body example synthesizer.
 *
 * Called by the factory with the controller's model type and the base route name
 * (one of the 8 generated route identifiers). Return any JSON-serializable value; the
 * return ships verbatim into the emitted OpenAPI JSON as the route's request-body example.
 *
 * Security: the return value is copied unchanged into the emitted OpenAPI document and
 * served wherever Swagger UI or the OpenAPI JSON is hosted. Do not return secrets,
 * production PII, credentials, or anything you would not publish.
 */
export type CrudSwaggerSynthExampleFn = (entity: any, route: BaseRouteName) => unknown;

/**
 * Controller-scoped Swagger/OpenAPI customization surface for `@Crud()`-generated routes.
 *
 * All fields are optional; when absent the factory's built-in defaults apply. Values flow
 * from the decorator into the emitted OpenAPI metadata verbatim, so consumer-supplied
 * prose fields (`description`, `operations.*.description`, `operations.*.summary`) sit on
 * the consumer's trust boundary — do not interpolate untrusted input into them.
 *
 * @example
 * ```ts
 * @Crud({
 *   model: { type: User },
 *   swagger: {
 *     tag: 'Users',
 *     description: 'User resource administration.',
 *     operations: {
 *       getManyBase: { summary: 'List active users' },
 *     },
 *     errorResponses: { unauthorized: true },
 *     tagWithVersion: true,
 *   },
 * })
 * export class UsersController implements CrudController<User> {}
 * ```
 */
export interface CrudSwaggerOptions {
  /**
   * Tag(s) attached to every generated route via `@ApiTags`. When unset, a pluralized
   * form of the controller's model name is used. When the controller class is already
   * decorated with `@ApiTags(...)`, the existing tag wins and no auto-assignment happens.
   *
   * Note: when the application uses `app.enableVersioning()`, auto-assigned tags can
   * collide across API versions (for example `Users` for both a `v1` and a `v2`
   * controller). Set {@link CrudSwaggerOptions.tagWithVersion} to `true` to prepend
   * `v{version}/` to the default tag, or set `tag` manually to disambiguate.
   */
  tag?: string | string[];

  /**
   * Free-form controller-level description surfaced in the emitted OpenAPI metadata.
   * Consumer-supplied prose; do not interpolate untrusted input.
   */
  description?: string;

  /**
   * Opt out of request-body example synthesis for the create/update/replace routes.
   * Defaults to auto-synth (`true`). Set `false` to disable.
   */
  examples?: boolean;

  /**
   * Per-route overrides for generated operation metadata. Keys are the 8 base route
   * names; values mirror `ApiOperationOptions` minus `operationId`, which is computed
   * per-route to preserve OpenAPI uniqueness and cannot be overridden.
   */
  operations?: Partial<Record<BaseRouteName, CrudSwaggerOperationOptions>>;

  /**
   * Opt-ins for 4xx error-response emission. Setting
   * `errorResponses.unauthorized: true` force-emits a `401 Unauthorized` response on
   * every generated route even when `@CrudAuth()` is not present on the controller
   * class — useful when authentication is enforced via a globally-registered guard
   * (e.g. via the `APP_GUARD` provider token).
   */
  errorResponses?: CrudSwaggerErrorResponsesOptions;

  /**
   * Consumer-supplied synthesizer for request-body examples. Called with the route's
   * model type and the base route name; return any JSON-serializable value. Takes
   * precedence over the built-in `@ApiProperty` introspection path. When unset, the
   * built-in synthesizer runs (and falls back to `{}` when the entity carries no
   * `@ApiProperty` metadata).
   *
   * Security: the return value ships verbatim in the emitted OpenAPI JSON. Do not
   * return secrets, production PII, or anything you would not publish.
   */
  synthExample?: CrudSwaggerSynthExampleFn;

  /**
   * When `true`, the auto-assigned `@ApiTags` value is prefixed with `v{version}/` read
   * at factory time from NestJS's controller-version metadata (`VERSION_METADATA`). Has
   * no effect when `tag` is set manually, or when the controller class has no version
   * metadata (in which case the factory falls back to the un-prefixed default tag).
   * Default: `false`.
   */
  tagWithVersion?: boolean;
}
