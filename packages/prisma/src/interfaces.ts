import type { JoinResolver } from '@nestjs-crud/core';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface PrismaQueryTranslatorConfig<_T> {
  entityColumns: string[];

  entityPrimaryColumns: string[];

  entityHasDeleteColumn: boolean;

  // Prisma uses column NAME string, not Column object
  softDeleteColumn: string | null;

  onBadRequest: (msg: string) => void;

  joinResolver: JoinResolver<any>;

  // names of to-one/to-many relation fields
  relationFields?: string[];
}

export interface PrismaClientLike {
  // Interactive (callback) form — SEC-03 write paths
  $transaction<R>(fn: (tx: any) => Promise<R>, opts?: { isolationLevel?: string }): Promise<R>;

  // Array form — D-03 createMany (C3: native createMany returns { count } only)
  $transaction<R>(ops: Promise<R>[]): Promise<R[]>;

  [model: string]: any;
}
