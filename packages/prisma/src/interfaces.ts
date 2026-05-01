import type { JoinResolver } from '@nestjs-crud/core';
import type { CacheStrategy } from '@nestjs-crud/core/cache';

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

  /** Optional cache backend. When set, FetchHelper wraps reads and invalidates on writes. */
  cacheStrategy?: CacheStrategy;

  /** Entity name used as cache-key prefix. Required when cacheStrategy is set. */
  entityName?: string;

  /** Optional logger passed into PrismaFetchHelper for cacheErrorPolicy warnings (FIX 2). */
  logger?: {
    error: (msg: string, trace?: string) => void;
    warn?: (msg: string) => void;
    debug?: (msg: string) => void;
    [k: string]: any;
  };
}

export interface PrismaClientLike {
  // Interactive (callback) form — for transaction-wrapped write paths
  $transaction<R>(fn: (tx: any) => Promise<R>, opts?: { isolationLevel?: string }): Promise<R>;

  // Array form — for createMany (native createMany returns { count } only)
  $transaction<R>(ops: Promise<R>[]): Promise<R[]>;

  [model: string]: any;
}
