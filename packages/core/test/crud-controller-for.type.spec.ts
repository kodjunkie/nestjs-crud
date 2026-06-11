import 'reflect-metadata';

// Root-path import is deliberate — do not change to a relative path; it asserts the public export chain.
import { CrudController, CrudControllerFor, CrudService } from '@nestjs-crud/core';

describe('CrudControllerFor type helper', () => {
  class Contact {}

  it('(a) custom-name form compiles without TS2559', () => {
    class ContactsController implements CrudControllerFor<Contact, 'contactService'> {
      contactService?: CrudService<Contact>;
    }
    expect(ContactsController).toBeDefined();
  });

  it('(b) default form is assignable to CrudController<T> and vice versa', () => {
    const _a: CrudController<Contact> = {} as CrudControllerFor<Contact>;
    const _b: CrudControllerFor<Contact> = {} as CrudController<Contact>;
    void _a;
    void _b;
    expect(true).toBe(true);
  });

  it('(c) broken pattern still errors (ts-expect-error guards the TS2559)', () => {
    // @ts-expect-error — TS2559: class with only renamed field has no common property with CrudController<T>
    class BrokenController implements CrudController<Contact> {
      contactService?: CrudService<Contact>;
    }
    void BrokenController;
    expect(true).toBe(true);
  });
});
