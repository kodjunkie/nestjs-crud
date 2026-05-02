import { BadRequestException } from '@nestjs/common';

import { CursorPayload } from './cursor-payload.interface';

/**
 * Cursor encoder/decoder — base64url-encoded JSON payload.
 *
 * Decode failures (malformed base64, non-JSON, missing required fields,
 * invalid `dir`) throw `BadRequestException('Invalid cursor')` — fail-fast
 * over silent reset.
 *
 * @since 2.2.0
 */
export const CursorCodec = {
  encode(_p: CursorPayload): string {
    throw new Error('CursorCodec.encode NOT_IMPLEMENTED — Plan 01 fills body');
  },
  decode(_token: string): CursorPayload {
    throw new BadRequestException('Invalid cursor');
  },
};
