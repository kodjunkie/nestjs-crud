import type { InputSanitizer as IInputSanitizer } from '../interfaces/input-sanitizer.interface';

export interface InputSanitizerConfig {
  allowedColumns: ReadonlySet<string> | (() => ReadonlySet<string>);
  onBadRequest: (msg: string) => void;
}

export class InputSanitizer implements IInputSanitizer {
  private readonly allowedColumns: () => ReadonlySet<string>;

  private readonly onBadRequest: (msg: string) => void;

  constructor(config: InputSanitizerConfig) {
    this.allowedColumns =
      typeof config.allowedColumns === 'function'
        ? config.allowedColumns
        : () => config.allowedColumns as ReadonlySet<string>;
    this.onBadRequest = config.onBadRequest;
  }

  public check(field: string): boolean {
    const base = field.includes('.') ? field.split('.')[0] : field;
    return this.allowedColumns().has(base) || this.allowedColumns().has(field);
  }

  public assert(field: string): void {
    if (!this.check(field)) {
      this.onBadRequest(`Field "${field}" is not allowed`);
    }
  }
}
