import { SwaggerEnumType } from '@nestjs/swagger/dist/types/swagger-enum.type';
import { ParamOptionType } from '@nestjs-crud/request';

export interface ParamsOptions {
  [key: string]: ParamOption;
}

export interface ParamOption {
  field?: string;
  type?: ParamOptionType;
  /**
   * @deprecated Since v1.0.2. The `enum` field is typed against
   * @nestjs/swagger's internal import path
   * (`@nestjs/swagger/dist/types/swagger-enum.type`). v2.0 will
   * switch to the public Swagger type export (see v2 TYPES-05).
   * Consumer code that passes an `enum` array continues to work
   * unchanged.
   *
   * Migration guide:
   * {@link https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration}
   */
  enum?: SwaggerEnumType;
  primary?: boolean;
  disabled?: boolean;
}
