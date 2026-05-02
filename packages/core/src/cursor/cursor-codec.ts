import { BadRequestException } from '@nestjs/common';

import { CursorPayload } from './cursor-payload.interface';

/**
 * Maximum cursor token length (bytes/chars) before base64-decode is attempted.
 * Bounded to prevent CPU/memory DoS via oversized tokens. 1KB is generous —
 * a typical cursor is ~80-200 chars (base64-encoded JSON of small payload).
 */
export const CURSOR_MAX_LENGTH = 1024;

/**
 * Cursor encoder/decoder — base64url-encoded JSON payload.
 *
 * Decode failures (oversized token, malformed base64, non-JSON, missing
 * required fields, invalid `dir`) throw `BadRequestException` — fail-fast
 * over silent reset.
 *
 * @since 2.2.0
 */
export const CursorCodec = {
  encode(p: CursorPayload): string {
    return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
  },
  decode(token: string): CursorPayload {
    if (typeof token !== 'string' || token.length > CURSOR_MAX_LENGTH) {
      throw new BadRequestException('Cursor token exceeds maximum length');
    }
    let raw: unknown;
    try {
      const json = Buffer.from(token, 'base64url').toString('utf8');
      raw = JSON.parse(json);
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    if (
      raw === null ||
      typeof raw !== 'object' ||
      typeof (raw as CursorPayload).sortField !== 'string' ||
      ((raw as CursorPayload).dir !== 'next' && (raw as CursorPayload).dir !== 'prev') ||
      (raw as CursorPayload).id === undefined ||
      (raw as CursorPayload).sortValue === undefined
    ) {
      throw new BadRequestException('Invalid cursor');
    }
    return raw as CursorPayload;
  },
};
