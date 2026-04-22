export function setEnv(): void {
  process.env.PRISMA_PROVIDER = 'mysql';
  // Use a dedicated database (nestjs_crud_prisma) so Prisma db push does not
  // touch the nestjs_crud database used by TypeORM/Drizzle/MikroORM.
  // MySQL root credentials are required to CREATE DATABASE if it doesn't exist.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'mysql://root:nestjs_crud@127.0.0.1:3316/nestjs_crud_prisma';
}
