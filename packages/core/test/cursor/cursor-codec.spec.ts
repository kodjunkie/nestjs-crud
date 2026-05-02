// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CursorCodec } from '@nestjs-crud/core/cursor';

describe('CursorCodec', () => {
  it.todo('round-trips encode->decode preserving sortField/sortValue/id/dir — Plan 01');
  it.todo('throws BadRequestException on malformed base64 — Plan 01');
  it.todo('throws BadRequestException on non-JSON payload — Plan 01');
  it.todo('throws BadRequestException on missing sortField field — Plan 01');
  it.todo('throws BadRequestException on missing dir field — Plan 01');
  it.todo("throws BadRequestException on dir not in {'next','prev'} — Plan 01");
});
