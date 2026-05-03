import { CacheStrategy } from '@nestjs-crud/core';
import { MockCacheStrategy } from '@nestjs-crud/core';

describe('CacheStrategy', () => {
  it('exports a named interface from @nestjs-crud/core', () => {
    // Compile-time check: TypeScript would fail this file's parse if the type didn't exist.
    // Runtime check: a MockCacheStrategy instance structurally matches the interface.
    const impl: CacheStrategy = new MockCacheStrategy();
    expect(typeof impl.wrap).toBe('function');
    expect(typeof impl.get).toBe('function');
    expect(typeof impl.set).toBe('function');
    expect(typeof impl.invalidate).toBe('function');
  });
});
