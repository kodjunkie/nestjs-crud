import type { SCondition } from '@nestjs-crud/request';

/**
 * Compiles the parsed search tree (SCondition + paramsFilter + authPersist) into
 * the ORM's native predicate type `W` (Brackets | SQL | FilterQuery).
 * No side-effects on Q. Implementations: per-adapter in packages/{adapter}/src/query/.
 *
 * @internal — implementation detail of @nestjs-crud adapters.
 * Subject to change without a semver-major bump. Not exported from the main
 * `@nestjs-crud/core` barrel; accessed via `@nestjs-crud/core/query` deep path.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface WhereBuilder<_Q, W> {
  build(search: SCondition): W;
}
