/**
 * schema-drift-audit.ts
 *
 * Validates that field names in schema.postgres.prisma (canonical schema for Prisma fixture)
 * match the field names in canonical-entities.ts for User, Company, and Project models.
 *
 * Usage:  npx ts-node -T schema-drift-audit.ts
 * Exit 0: no drift detected.
 * Exit 1: drift detected — lists missing/extra fields.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA_PATH = path.resolve(__dirname, 'schema.postgres.prisma');
const CANONICAL_PATH = path.resolve(
  __dirname,
  '../../../../packages/core/test/__shared-fixture__/canonical-entities.ts',
);

// ---------------------------------------------------------------------------
// Parse model field names from schema.prisma
// ---------------------------------------------------------------------------
function parseSchemaFields(schemaContent: string, modelName: string): Set<string> {
  const modelRegex = new RegExp(`model\\s+${modelName}\\s*\\{([^}]+)\\}`, 's');
  const match = schemaContent.match(modelRegex);
  if (!match) {
    throw new Error(`Model "${modelName}" not found in schema.prisma`);
  }
  const body = match[1];
  const fields = new Set<string>();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines, comments, directives (@@), and relation-only fields (no type annotation)
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const fieldName = parts[0];
    const typePart = parts[1];
    // Prisma scalar types we want to keep
    const SCALAR_TYPES = new Set([
      'Int', 'String', 'Boolean', 'Float', 'Decimal', 'BigInt',
      'DateTime', 'Json', 'Bytes', 'Unsupported',
    ]);
    // Skip relation fields (they reference model names: Company, User, Project[], etc.)
    const baseType = typePart.replace(/[\[\]?]/g, '');
    if (/^[A-Z]/.test(baseType) && !SCALAR_TYPES.has(baseType)) continue;
    fields.add(fieldName);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Parse interface field names from canonical-entities.ts
// ---------------------------------------------------------------------------
function parseCanonicalFields(tsContent: string, interfaceName: string): Set<string> {
  const interfaceRegex = new RegExp(`interface\\s+${interfaceName}\\s*\\{([^}]+)\\}`, 's');
  const match = tsContent.match(interfaceRegex);
  if (!match) {
    throw new Error(`Interface "${interfaceName}" not found in canonical-entities.ts`);
  }
  const body = match[1];
  const fields = new Set<string>();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const rawName = trimmed.slice(0, colonIdx).replace('?', '').trim();
    if (rawName) fields.add(rawName);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------
function audit(): void {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const tsContent = fs.readFileSync(CANONICAL_PATH, 'utf-8');

  const pairs: Array<{ model: string; interface: string }> = [
    { model: 'User', interface: 'CanonicalUser' },
    { model: 'Company', interface: 'CanonicalCompany' },
    { model: 'Project', interface: 'CanonicalProject' },
  ];

  let driftFound = false;

  for (const { model, interface: iface } of pairs) {
    const schemaFields = parseSchemaFields(schemaContent, model);
    const canonicalFields = parseCanonicalFields(tsContent, iface);

    // id is in canonical interface but auto-handled by Prisma — still check it
    const missing = [...canonicalFields].filter((f) => !schemaFields.has(f));
    const extra = [...schemaFields].filter((f) => !canonicalFields.has(f));

    if (missing.length > 0 || extra.length > 0) {
      driftFound = true;
      if (missing.length > 0) {
        console.error(
          `[DRIFT] ${model}: fields in canonical-entities but MISSING from schema.prisma: ${missing.join(', ')}`,
        );
      }
      if (extra.length > 0) {
        console.error(
          `[DRIFT] ${model}: fields in schema.prisma but NOT in canonical-entities: ${extra.join(', ')}`,
        );
      }
    } else {
      console.log(`[OK] ${model}: field parity verified (${schemaFields.size} scalar fields)`);
    }
  }

  if (driftFound) {
    console.error('\nDrift audit FAILED — fix schema.prisma to match canonical-entities.ts');
    process.exit(1);
  }

  console.log('\nDrift audit PASSED — schema.prisma is in sync with canonical-entities.ts');
}

audit();
