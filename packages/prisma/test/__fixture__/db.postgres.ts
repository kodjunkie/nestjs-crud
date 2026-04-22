export function setEnv(): void {
  process.env.PRISMA_PROVIDER = 'postgresql';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://root:root@127.0.0.1:5455/nestjs_crud';
}
