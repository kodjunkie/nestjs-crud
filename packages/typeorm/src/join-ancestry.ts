/**
 * @internal
 * Ancestor-checking helpers for nested `?join=` fields. A dotted join field
 * such as `profile.licenses` is only safe to resolve once every proper
 * dotted prefix of that field (`profile`) is also present. Not re-exported
 * from the package index — consumed internally by the join resolver and the
 * query composer only.
 */

/**
 * Return every proper dotted prefix of `field`, shallow to deep.
 *
 * `ancestorPaths('a.b.c')` returns `['a', 'a.b']`.
 * `ancestorPaths('a')` returns `[]`.
 */
export function ancestorPaths(field: string): string[] {
  const segments = field.split('.');
  const paths: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    paths.push(segments.slice(0, i).join('.'));
  }

  return paths;
}

/**
 * Given the set of fields being joined, return the first field (in array
 * order) that has a missing ancestor, or `undefined` when every field's
 * ancestors are all present in the same set.
 */
export function findOrphanJoin(joinedFields: readonly string[]): string | undefined {
  const joined = new Set(joinedFields);

  for (const field of joinedFields) {
    const missing = ancestorPaths(field).some((ancestor) => !joined.has(ancestor));

    if (missing) {
      return field;
    }
  }

  return undefined;
}

/**
 * Format the rejection message for an orphan nested join (the full dotted
 * field, quoted).
 */
export function invalidJoinMessage(field: string): string {
  return `Invalid join: '${field}'`;
}
