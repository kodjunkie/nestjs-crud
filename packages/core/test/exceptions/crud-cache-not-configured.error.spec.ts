import { HttpException } from '@nestjs/common';

import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';

describe('CrudCacheNotConfiguredError', () => {
  it('is an Error subclass with the expected name', () => {
    const err = new CrudCacheNotConfiguredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CrudCacheNotConfiguredError');
  });

  it('message names both wiring paths and the @Crud cache option', () => {
    const err = new CrudCacheNotConfiguredError();
    // Acceptance: message must reference both the global path AND ctor injection
    expect(err.message).toContain('CrudConfigService.load');
    expect(err.message).toContain('constructor');
    // Existing assertion preserved (legacy TypeORM fallback hint)
    expect(err.message).toContain('DataSource');
    expect(err.message).toContain('@Crud');
  });

  it('is NOT an HttpException (deliberate API boundary — `error-throw-http-exceptions` polish lock-in)', () => {
    const err = new CrudCacheNotConfiguredError();
    expect(err).not.toBeInstanceOf(HttpException);
  });
});
