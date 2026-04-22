/**
 * Map a nestjs-crud operator token (e.g. `$eq`, `$gt`, `$contL`) to the
 * corresponding Prisma filter key.
 *
 * Stub — Plan 02 fills in the full operator table from FEATURES.md §2.
 */
export function mapOperator(_op: string): string {
  // TODO (Plan 02): expand to full operator map ($eq→equals, $ne→not, $gt→gt, $contL→contains+mode:'insensitive', ...)
  return 'equals';
}
