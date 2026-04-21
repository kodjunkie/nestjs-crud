import type { InputSanitizer as IInputSanitizer } from '../interfaces/input-sanitizer.interface';

/**
 * Single source of truth for the v1 SQL-injection denylist regex array.
 * Used by `InputSanitizer` when `strictMode === false` (opt-out fallback).
 * Byte-for-byte identical across all 3 adapters prior to v2.0.0 (verified).
 * No `/g` flag — preserves historical QUALITY-02/03 fix.
 *
 * @since 2.0.0
 */
export const DEFAULT_SQL_INJECTION_REGEX: ReadonlyArray<RegExp> = [
  /(%27)|(\')|(--)|(%23)|(#)/i,
  /((%3D)|(=))[^\n]*((%27)|(\')|(--)|(%3B)|(;))/i,
  /w*((%27)|(\'))((%6F)|o|(%4F))((%72)|r|(%52))/i,
  /((%27)|(\'))union/i,
];

export interface InputSanitizerConfig {
  allowedColumns: ReadonlySet<string> | (() => ReadonlySet<string>);
  onBadRequest: (msg: string) => void;
  strictMode: boolean;
  denylistRegex: ReadonlyArray<RegExp>;
}

export class InputSanitizer implements IInputSanitizer {
  private readonly allowedColumns: () => ReadonlySet<string>;

  private readonly onBadRequest: (msg: string) => void;

  private readonly strictMode: boolean;

  private readonly denylistRegex: ReadonlyArray<RegExp>;

  constructor(config: InputSanitizerConfig) {
    this.allowedColumns =
      typeof config.allowedColumns === 'function'
        ? config.allowedColumns
        : () => config.allowedColumns as ReadonlySet<string>;
    this.onBadRequest = config.onBadRequest;
    this.strictMode = config.strictMode;
    this.denylistRegex = config.denylistRegex;
  }

  public check(field: string): boolean {
    if (!this.strictMode) return !this.hitsDenylist(field);
    const base = field.includes('.') ? field.split('.')[0] : field;
    return this.allowedColumns().has(base) || this.allowedColumns().has(field);
  }

  public assert(field: string): void {
    if (!this.strictMode) {
      if (this.hitsDenylist(field)) {
        this.onBadRequest(`SQL injection detected: "${field}"`);
      }
      return;
    }
    if (!this.check(field)) {
      this.onBadRequest(`Field "${field}" is not allowed`);
    }
  }

  private hitsDenylist(field: string): boolean {
    for (let i = 0; i < this.denylistRegex.length; i++) {
      if (this.denylistRegex[i].test(field)) return true;
    }
    return false;
  }
}
