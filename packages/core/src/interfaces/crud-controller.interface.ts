import { CrudService } from '../services';
import { CrudRequest, GetManyDefaultResponse, CreateManyDto } from '../interfaces';

export interface CrudController<T> {
  service?: CrudService<T>;
  getManyBase?(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]>;
  getOneBase?(req: CrudRequest): Promise<T>;
  createOneBase?(req: CrudRequest, dto: T): Promise<T>;
  createManyBase?(req: CrudRequest, dto: CreateManyDto<T>): Promise<T[]>;
  updateOneBase?(req: CrudRequest, dto: T): Promise<T>;
  replaceOneBase?(req: CrudRequest, dto: T): Promise<T>;
  deleteOneBase?(req: CrudRequest): Promise<void | T>;
  recoverOneBase?(req: CrudRequest): Promise<void | T>;
}

/**
 * Type-safe alternative to {@link CrudController} for controllers that use
 * `@Crud({ serviceProperty: 'myServiceName' })`.
 *
 * `CrudController<T>` is an all-optional interface (a TypeScript "weak type").
 * When a controller declares only a renamed field (e.g. `contactService`) and
 * writes `implements CrudController<T>`, TypeScript raises TS2559 because the
 * class shares no properties with the interface. Use this helper instead:
 *
 * @example
 * ```typescript
 * @Crud({ model: { type: Contact }, serviceProperty: 'contactService' })
 * @Controller('contacts')
 * export class ContactsController implements CrudControllerFor<Contact, 'contactService'> {
 *   constructor(public contactService: ContactsCrudService) {}
 * }
 * ```
 *
 * Alternatively, drop `implements` entirely — NestJS does not require it for
 * routing to work; the interface only adds static type-checking.
 */
export type CrudControllerFor<T, P extends string = 'service'> =
  { [K in P]?: CrudService<T> } &
  Omit<CrudController<T>, 'service'>;
