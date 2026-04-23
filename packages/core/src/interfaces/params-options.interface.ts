import { ParamOptionType } from '@nestjs-crud/request';

/**
 * Inline equivalent of Swagger's `SwaggerEnumType`.
 * Dropped the `@nestjs/swagger/dist/types/swagger-enum.type` internal import
 * to avoid coupling to Swagger's private dist layout.
 */
type EnumType = string[] | number[] | (string | number)[] | Record<number, string>;

export interface ParamsOptions {
  [key: string]: ParamOption;
}

export interface ParamOption {
  field?: string;
  type?: ParamOptionType;
  enum?: EnumType;
  primary?: boolean;
  disabled?: boolean;
}
