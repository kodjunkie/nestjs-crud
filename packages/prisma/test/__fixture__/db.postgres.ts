export function setEnv(): void {
  process.env.PRISMA_PROVIDER = 'postgresql';
  // ?schema=prisma_smoke isolates Prisma tables from the public schema used by
  // TypeORM/Drizzle/MikroORM, preventing db push from dropping their tables.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://root:root@127.0.0.1:5455/nestjs_crud?schema=prisma_smoke';
}
