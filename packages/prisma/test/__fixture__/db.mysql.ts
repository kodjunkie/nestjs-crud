export function setEnv(): void {
  process.env.PRISMA_PROVIDER = 'mysql';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'mysql://nestjs_crud:nestjs_crud@127.0.0.1:3316/nestjs_crud';
}
