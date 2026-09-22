import { Crud } from '../src/decorators/crud.decorator';
import { JoinOptions } from '../src/interfaces';
import { TestModel } from './__fixture__/models';

describe('#crud', () => {
  describe('#join options validation', () => {
    const applyCrud = (join: JoinOptions, target: new () => unknown) =>
      Crud({ model: { type: TestModel }, query: { join } })(target);

    const catchError = (join: JoinOptions, target: new () => unknown): Error => {
      try {
        applyCrud(join, target);
      } catch (error) {
        return error as Error;
      }
      throw new Error('expected applyCrud to throw, but it did not');
    };

    it('throws when a nested eager join key has a non-eager immediate parent', () => {
      class ProfileLicensesEagerController {}
      const join: JoinOptions = { profile: {}, 'profile.licenses': { eager: true } };

      const error = catchError(join, ProfileLicensesEagerController);

      expect(error.message).toContain('@Crud:');
      expect(error.message).toContain('ProfileLicensesEagerController');
      expect(error.message).toContain("'profile.licenses'");
      expect(error.message).toContain("'profile'");
    });

    it('throws when a nested eager join key has no ancestor entry at all', () => {
      class FooBarEagerController {}
      const join: JoinOptions = { 'foo.bar': { eager: true } };

      const error = catchError(join, FooBarEagerController);

      expect(error.message).toContain("'foo.bar'");
      expect(error.message).toContain("'foo'");
    });

    it('names the first non-eager ancestor shallow to deep across a 3-segment chain', () => {
      class DeepChainEagerController {}
      const join: JoinOptions = { a: { eager: true }, 'a.b': {}, 'a.b.c': { eager: true } };

      const error = catchError(join, DeepChainEagerController);

      expect(error.message).toContain("'a.b.c'");
      expect(error.message).toContain("'a.b'");
      expect(error.message).not.toContain("needs 'a' to be eager");
    });

    it('respects segment boundaries — a string-prefix sibling key does not satisfy the ancestor check', () => {
      class SegmentBoundaryController {}
      const join: JoinOptions = { profiles: { eager: true }, 'profile.licenses': { eager: true } };

      const error = catchError(join, SegmentBoundaryController);

      expect(error.message).toContain("'profile'");
    });

    it('does not throw when every ancestor up the chain is eager', () => {
      class AllEagerChainController {}
      const join: JoinOptions = { profile: { eager: true }, 'profile.licenses': { eager: true } };

      expect(() => applyCrud(join, AllEagerChainController)).not.toThrow();
    });

    it('does not throw for a non-eager nested join key', () => {
      class NonEagerNestedController {}
      const join: JoinOptions = { profile: {}, 'profile.licenses': {} };

      expect(() => applyCrud(join, NonEagerNestedController)).not.toThrow();
    });

    it('does not throw for a flat unknown eager key', () => {
      class FlatUnknownEagerController {}
      const join: JoinOptions = { invalid: { eager: true } };

      expect(() => applyCrud(join, FlatUnknownEagerController)).not.toThrow();
    });

    it('does not throw when a flat key and its dotted child are both eager', () => {
      class FlatAndChildEagerController {}
      const join: JoinOptions = { foo: { eager: true }, 'foo.bar': { eager: true } };

      expect(() => applyCrud(join, FlatAndChildEagerController)).not.toThrow();
    });

    it('does not throw when there is no query.join at all', () => {
      class NoJoinController {}

      expect(() => Crud({ model: { type: TestModel } })(NoJoinController)).not.toThrow();
    });
  });
});
