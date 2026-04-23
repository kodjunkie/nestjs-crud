/**
 * Structural interface matching the public surface of Drizzle ORM database
 * clients (`NodePgDatabase`, `MySql2Database`, `BetterSQLite3Database`, etc.).
 *
 * Used as a structural interface rather than a union of concrete driver types
 * because Drizzle's generics differ significantly per driver, and consumer
 * subclasses typically work with a single specific driver.
 *
 * Consumers must pass a fully-constructed Drizzle database instance (e.g.
 * `drizzle(pool)`) that satisfies this structural shape.
 *
 * @since 2.0.0
 */
export interface DrizzleClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (...args: any[]) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (...args: any[]) => any;

  transaction: <T>(
    cb: (tx: DrizzleClient) => Promise<T>,
    config?: {
      isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
    },
  ) => Promise<T>;

  /** Optional dialect descriptor. Present on some drivers (e.g. `{ name: 'pg' }`). */
  dialect?: unknown;
}
