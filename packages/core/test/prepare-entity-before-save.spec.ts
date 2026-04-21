import 'reflect-metadata';
import { prepareEntityBeforeSave } from '@nestjs-crud/core';

class Entity {
  id: number;

  name: string;
}

describe('prepareEntityBeforeSave (pure util)', () => {
  const baseParsed = {
    paramsFilter: [],
    authPersist: {},
    classTransformOptions: {},
  } as any;

  it('returns undefined for non-object dto', () => {
    expect(prepareEntityBeforeSave(null as any, baseParsed, Entity)).toBeUndefined();
    expect(prepareEntityBeforeSave('string' as any, baseParsed, Entity)).toBeUndefined();
    expect(prepareEntityBeforeSave(undefined as any, baseParsed, Entity)).toBeUndefined();
  });

  it('applies paramsFilter fields to dto before class transform', () => {
    const dto = { name: 'x' } as Partial<Entity>;
    const parsed = { ...baseParsed, paramsFilter: [{ field: 'id', value: 42 }] };
    const result = prepareEntityBeforeSave(dto, parsed, Entity);
    expect(result).toBeInstanceOf(Entity);
    expect((result as any).id).toBe(42);
    expect((result as any).name).toBe('x');
  });

  it('returns undefined when dto has no keys after processing', () => {
    expect(prepareEntityBeforeSave({}, baseParsed, Entity)).toBeUndefined();
  });

  it('uses Object.assign branch when dto is already an instance of entityType', () => {
    const dto = new Entity();
    dto.name = 'seed';
    const parsed = { ...baseParsed, authPersist: { id: 7 } };
    const result = prepareEntityBeforeSave(dto, parsed, Entity) as Entity;
    // same reference — Object.assign branch preserves identity
    expect(result).toBe(dto);
    expect(result.id).toBe(7);
    expect(result.name).toBe('seed');
  });

  it('uses plainToClass branch for plain object dto and merges authPersist', () => {
    const dto = { name: 'fresh' };
    const parsed = { ...baseParsed, authPersist: { id: 99 } };
    const result = prepareEntityBeforeSave(dto, parsed, Entity);
    expect(result).toBeInstanceOf(Entity);
    expect((result as any).id).toBe(99);
    expect((result as any).name).toBe('fresh');
  });
});
