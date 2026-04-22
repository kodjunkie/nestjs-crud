/**
 * Shared SCondition parity matrix + SQLi cases for PARITY-03.
 *
 * REFERENCE_DATASET: 10 deterministic users (IDs 1–10) used by all 3 harnesses.
 * Field shapes mirror CanonicalUser but trimmed to what the parity spec exercises.
 *
 * SCONDITION_CASES: 15 parity cases — each specifies a `parsed` partial and
 * the list of `expectedIds` from REFERENCE_DATASET that satisfy the predicate.
 *
 * SQLI_CASES: 3+ dotted-path injection vectors — applyToQuery MUST throw
 * (via the throwing `onBadRequest` stub) for every case × every adapter.
 */
import type { SCondition } from '@nestjs-crud/request';

// ---------------------------------------------------------------------------
// Reference dataset — 10 users with deterministic, predicate-testable values
// ---------------------------------------------------------------------------

export interface RefUser {
  id: number;
  email: string;
  nameFirst: string;
  nameLast: string;
  isActive: boolean;
  companyId: number;
  profileId: number | null;
  age: number;
}

export const REFERENCE_DATASET: ReadonlyArray<RefUser> = [
  {
    id: 1,
    email: '1@example.com',
    nameFirst: 'Alice',
    nameLast: 'Smith',
    isActive: true,
    companyId: 1,
    profileId: 1,
    age: 25,
  },
  {
    id: 2,
    email: '2@example.com',
    nameFirst: 'Bob',
    nameLast: 'Jones',
    isActive: true,
    companyId: 1,
    profileId: 2,
    age: 30,
  },
  {
    id: 3,
    email: '3@example.com',
    nameFirst: 'Carol',
    nameLast: 'White',
    isActive: true,
    companyId: 2,
    profileId: null,
    age: 22,
  },
  {
    id: 4,
    email: '4@example.com',
    nameFirst: 'Dave',
    nameLast: 'Brown',
    isActive: false,
    companyId: 2,
    profileId: null,
    age: 28,
  },
  {
    id: 5,
    email: '5@example.com',
    nameFirst: 'Eve',
    nameLast: 'Davis',
    isActive: true,
    companyId: 3,
    profileId: 5,
    age: 35,
  },
  {
    id: 6,
    email: '6@foo.com',
    nameFirst: 'Frank',
    nameLast: 'Miller',
    isActive: true,
    companyId: 3,
    profileId: 6,
    age: 40,
  },
  {
    id: 7,
    email: '7@foo.com',
    nameFirst: 'Grace',
    nameLast: 'Wilson',
    isActive: false,
    companyId: 4,
    profileId: null,
    age: 18,
  },
  {
    id: 8,
    email: '8@example.com',
    nameFirst: 'Hank',
    nameLast: 'Moore',
    isActive: false,
    companyId: 4,
    profileId: 8,
    age: 45,
  },
  {
    id: 9,
    email: '9@example.com',
    nameFirst: 'Ivy',
    nameLast: 'Taylor',
    isActive: false,
    companyId: 5,
    profileId: 9,
    age: 32,
  },
  {
    id: 10,
    email: '10@example.com',
    nameFirst: 'Jack',
    nameLast: 'Anderson',
    isActive: true,
    companyId: 5,
    profileId: 10,
    age: 27,
  },
];

// ---------------------------------------------------------------------------
// ParityCase type
// ---------------------------------------------------------------------------

export interface ParityCase {
  name: string;
  parsed: {
    filter?: any[];
    or?: any[];
    search?: SCondition;
    sort?: Array<{ field: string; order: 'ASC' | 'DESC' }>;
    limit?: number;
    offset?: number;
    page?: number;
  };
  /** IDs from REFERENCE_DATASET that satisfy this predicate (sort/pagination ignored for ID set). */
  expectedIds: number[];
}

// ---------------------------------------------------------------------------
// SCONDITION_CASES — 15 cases
// ---------------------------------------------------------------------------

export const SCONDITION_CASES: ReadonlyArray<ParityCase> = [
  // 1. equality — isActive = true
  {
    name: '$eq true',
    parsed: { search: { isActive: { $eq: true } } },
    expectedIds: [1, 2, 3, 5, 6, 10],
  },
  // 2. inequality — isActive != true
  {
    name: '$ne false',
    parsed: { search: { isActive: { $ne: true } } },
    expectedIds: [4, 7, 8, 9],
  },
  // 3. greater-than — id > 7
  {
    name: '$gt 7',
    parsed: { search: { id: { $gt: 7 } } },
    expectedIds: [8, 9, 10],
  },
  // 4. less-than-or-equal — id <= 3
  {
    name: '$lte 3',
    parsed: { search: { id: { $lte: 3 } } },
    expectedIds: [1, 2, 3],
  },
  // 5. contains — email contains 'example'
  {
    name: '$cont example',
    parsed: { search: { email: { $cont: 'example' } } },
    expectedIds: [1, 2, 3, 4, 5, 8, 9, 10],
  },
  // 6. in — id in [1, 3, 5]
  {
    name: '$in [1,3,5]',
    parsed: { search: { id: { $in: [1, 3, 5] } } },
    expectedIds: [1, 3, 5],
  },
  // 7. notin — id not in [1, 2, 3, 4, 5, 6, 7, 8]
  {
    name: '$notin [1..8]',
    parsed: { search: { id: { $notin: [1, 2, 3, 4, 5, 6, 7, 8] } } },
    expectedIds: [9, 10],
  },
  // 8. is null — profileId is null
  {
    name: '$isnull profileId',
    parsed: { search: { profileId: { $isnull: true } } },
    expectedIds: [3, 4, 7],
  },
  // 9. not null — profileId is not null
  {
    name: '$notnull profileId',
    parsed: { search: { profileId: { $notnull: true } } },
    expectedIds: [1, 2, 5, 6, 8, 9, 10],
  },
  // 10. $and: isActive=true AND id > 5
  {
    name: '$and isActive+gt',
    parsed: {
      search: {
        $and: [{ isActive: { $eq: true } }, { id: { $gt: 5 } }],
      },
    },
    expectedIds: [6, 10],
  },
  // 11. $or: email $cont 'foo' OR nameFirst $eq 'Alice'
  {
    name: '$or cont+eq',
    parsed: {
      search: {
        $or: [{ email: { $cont: 'foo' } }, { nameFirst: { $eq: 'Alice' } }],
      },
    },
    expectedIds: [1, 6, 7],
  },
  // 12. nested $and: [ $or[...], id $gt 1 ]
  {
    name: 'nested $and[$or,gt]',
    parsed: {
      search: {
        $and: [{ $or: [{ email: { $cont: 'foo' } }, { nameFirst: { $eq: 'Alice' } }] }, { id: { $gt: 1 } }],
      },
    },
    expectedIds: [6, 7],
  },
  // 13. sort asc (ID set is all 10 — sort does not filter)
  {
    name: 'sort email ASC',
    parsed: { sort: [{ field: 'email', order: 'ASC' }] },
    expectedIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  // 14. sort desc + limit 3 (top 3 by id DESC → IDs 10, 9, 8)
  {
    name: 'sort id DESC limit 3',
    parsed: { sort: [{ field: 'id', order: 'DESC' }], limit: 3 },
    expectedIds: [8, 9, 10],
  },
  // 15. combined: filter + sort + offset/limit pagination
  //   filter: isActive=true (IDs 1,2,3,5,6,10)
  //   sort id ASC, offset 2, limit 3 → IDs 3,5,6
  {
    name: 'combined filter+sort+pagination',
    parsed: {
      search: { isActive: { $eq: true } },
      sort: [{ field: 'id', order: 'ASC' }],
      limit: 3,
      offset: 2,
    },
    expectedIds: [3, 5, 6],
  },
];

// ---------------------------------------------------------------------------
// SQLi cases — 3 dotted-path injection vectors
// ---------------------------------------------------------------------------

export interface SqliCase {
  name: string;
  parsed: { sort?: Array<{ field: string; order: 'ASC' | 'DESC' }>; filter?: any[] };
  /** applyToQuery MUST throw with message containing one of these tokens */
  expectedErrorContains: string[];
}

export const SQLI_CASES: ReadonlyArray<SqliCase> = [
  // 1. SQL injection via fabricated sort column with SQL terminator
  {
    name: "sort: '; DROP TABLE users --",
    parsed: { sort: [{ field: "'; DROP TABLE users --", order: 'ASC' }] },
    expectedErrorContains: ['Invalid', 'sort', 'Bad Request'],
  },
  // 2. Dotted-path with unknown relation root (D-05b vector)
  {
    name: 'sort: admin.secret (unknown relation)',
    parsed: { sort: [{ field: 'admin.secret', order: 'ASC' }] },
    expectedErrorContains: ['Invalid', 'relation', 'Bad Request'],
  },
  // 3. Dotted-path UNION injection
  {
    name: "sort: x.y') UNION SELECT 1--",
    parsed: { sort: [{ field: "x.y') UNION SELECT 1--", order: 'ASC' }] },
    expectedErrorContains: ['Invalid', 'Bad Request'],
  },
];
