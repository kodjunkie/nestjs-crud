import { ClassType, hasLength, isObject, objKeys } from '@nestjs-crud/util';
import { plainToClass } from 'class-transformer';

import type { CrudRequest } from '../interfaces/crud-request.interface';

/**
 * Normalise a DTO against its entity class ahead of persistence.
 * Pure function — no side effects on shared state, no instance state.
 * Extracted from `TypeOrmCrudService.prepareEntityBeforeSave` in v2.0.0.
 *
 * @since 2.0.0
 */
export function prepareEntityBeforeSave<T>(
  dto: T | Partial<T>,
  parsed: CrudRequest['parsed'],
  entityType: ClassType<T>,
): T | undefined {
  if (!isObject(dto)) {
    return undefined;
  }

  if (hasLength(parsed.paramsFilter)) {
    for (const filter of parsed.paramsFilter) {
      (dto as any)[filter.field] = filter.value;
    }
  }

  if (!hasLength(objKeys(dto))) {
    return undefined;
  }

  return dto instanceof entityType
    ? (Object.assign(dto, parsed.authPersist) as T)
    : plainToClass(entityType, { ...dto, ...parsed.authPersist }, parsed.classTransformOptions);
}
