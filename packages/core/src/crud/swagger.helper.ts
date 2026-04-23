/**
 * Thin facade over the `./swagger/` submodule tree. Preserves the
 * `Swagger` class import surface for consumers (factory layer + specs).
 */
import * as ops from './swagger/operations.helper';
import * as res from './swagger/responses.helper';
import * as par from './swagger/params.helper';
import * as ex from './swagger/examples.helper';

export const swagger = res.swagger;
export const swaggerConst = res.swaggerConst;
export const swaggerPkgJson = res.swaggerPkgJson;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Swagger: any = {
  ...ops, ...res, ...par, ...ex,
  operationsMap: ops.operationsMap,
  createResponseMeta: res.createResponseMeta,
  createPathParamsMeta: par.createPathParamsMeta,
  createQueryParamsMeta: par.createQueryParamsMeta,
  synthesizeBodyExample: ex.synthesizeBodyExample,
  docsLink: par.docsLink,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ApiProperty(options?: any): PropertyDecorator {
  return (target: unknown, propertyKey: string | symbol) => {
    if (swagger) (swagger.ApiProperty || swagger.ApiModelProperty)(options)(target, propertyKey);
  };
}
