/**
 * Shared canonical shapes for cross-adapter test fixtures.
 * Consumed at TYPE level only — adapters decorate their own table definitions matching this shape.
 *
 * NO runtime imports from any @nestjs-crud/* package. Pure TypeScript interfaces only.
 */

export interface CanonicalUser {
  id: number;
  email: string;
  password: string;
  nameFirst: string;
  nameLast: string;
  isActive: boolean;
  companyId: number;
  profileId: number | null;
  deletedAt: Date | null;
}

export interface CanonicalCompany {
  id: number;
  name: string;
  domain: string;
  description: string | null;
}

export interface CanonicalProject {
  id: number;
  name: string;
  description: string | null;
  companyId: number;
  isActive: boolean;
}

export const CANONICAL_SEED_COMPANIES: ReadonlyArray<Omit<CanonicalCompany, 'id'>> = [
  { name: 'Name1', domain: 'Domain1', description: null },
  { name: 'Name2', domain: 'Domain2', description: null },
  { name: 'Name3', domain: 'Domain3', description: null },
  { name: 'Name4', domain: 'Domain4', description: null },
  { name: 'Name5', domain: 'Domain5', description: null },
  { name: 'Name6', domain: 'Domain6', description: null },
  { name: 'Name7', domain: 'Domain7', description: null },
  { name: 'Name8', domain: 'Domain8', description: null },
  { name: 'Name9', domain: 'Domain9', description: null },
  { name: 'Name10', domain: 'Domain10', description: null },
];

export const CANONICAL_SEED_USERS: ReadonlyArray<Omit<CanonicalUser, 'id'>> = [
  { email: '1@email.com', password: 'secret', nameFirst: 'firstname1', nameLast: 'lastname1', isActive: true, companyId: 1, profileId: 1, deletedAt: null },
  { email: '2@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 2, deletedAt: null },
  { email: '3@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 3, deletedAt: null },
  { email: '4@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 4, deletedAt: null },
  { email: '5@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 5, deletedAt: null },
  { email: '6@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 6, deletedAt: null },
  { email: '7@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: false, companyId: 1, profileId: 7, deletedAt: null },
  { email: '8@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: false, companyId: 1, profileId: 8, deletedAt: null },
  { email: '9@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: false, companyId: 1, profileId: 9, deletedAt: null },
  { email: '10@email.com', password: 'secret', nameFirst: '', nameLast: '', isActive: true, companyId: 1, profileId: 10, deletedAt: null },
];

export const CANONICAL_SEED_PROJECTS: ReadonlyArray<Omit<CanonicalProject, 'id'>> = [
  { name: 'Project1', description: 'description1', isActive: true, companyId: 1 },
  { name: 'Project2', description: 'description2', isActive: true, companyId: 1 },
  { name: 'Project3', description: 'description3', isActive: true, companyId: 2 },
  { name: 'Project4', description: 'description4', isActive: true, companyId: 2 },
  { name: 'Project5', description: 'description5', isActive: true, companyId: 3 },
  { name: 'Project6', description: 'description6', isActive: true, companyId: 3 },
  { name: 'Project7', description: 'description7', isActive: true, companyId: 4 },
  { name: 'Project8', description: 'description8', isActive: true, companyId: 4 },
  { name: 'Project9', description: 'description9', isActive: true, companyId: 5 },
  { name: 'Project10', description: 'description10', isActive: true, companyId: 5 },
];
