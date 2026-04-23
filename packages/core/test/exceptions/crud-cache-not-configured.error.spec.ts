import { HttpException } from '@nestjs/common';

import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';

describe('CrudCacheNotConfiguredError', () => {
  it('is an Error subclass with the expected name', () => {
    const err = new CrudCacheNotConfiguredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CrudCacheNotConfiguredError');
  });

  it('message names the cache provider misconfiguration', () => {
    const err = new CrudCacheNotConfiguredError();
    expect(err.message).toContain('cache provider');
    expect(err.message).toContain('DataSource');
    expect(err.message).toContain('@Crud');
  });

  it('is NOT an HttpException (deliberate API boundary — `error-throw-http-exceptions` polish lock-in)', () => {
    const err = new CrudCacheNotConfiguredError();
    expect(err).not.toBeInstanceOf(HttpException);
  });
});
