import { BadRequestException } from '@nestjs/common';

import { CursorCodec, CursorPayload } from '@nestjs-crud/core/cursor';

const basePayload = (): CursorPayload => ({
  sortField: 'createdAt',
  sortValue: '2026-01-01T00:00:00.000Z',
  id: 42,
  dir: 'next',
});

describe('CursorCodec', () => {
  describe('encode', () => {
    it('produces a URL-safe base64url string (no +, /, or = chars)', () => {
      const token = CursorCodec.encode(basePayload());
      expect(token).not.toMatch(/[+/=]/);
    });
  });

  describe('round-trip', () => {
    it('preserves payload for forward direction', () => {
      const p = basePayload();
      expect(CursorCodec.decode(CursorCodec.encode(p))).toEqual(p);
    });

    it('preserves payload for backward direction', () => {
      const p: CursorPayload = { ...basePayload(), dir: 'prev' };
      expect(CursorCodec.decode(CursorCodec.encode(p))).toEqual(p);
    });

    it('preserves null sortValue', () => {
      const p: CursorPayload = { ...basePayload(), sortValue: null };
      expect(CursorCodec.decode(CursorCodec.encode(p))).toEqual(p);
    });

    it('preserves string id (UUID/cuid)', () => {
      const p: CursorPayload = { ...basePayload(), id: 'cuid_abc123' };
      expect(CursorCodec.decode(CursorCodec.encode(p))).toEqual(p);
    });

    it('preserves numeric sortValue', () => {
      const p: CursorPayload = { ...basePayload(), sortValue: 1234567890 };
      expect(CursorCodec.decode(CursorCodec.encode(p))).toEqual(p);
    });
  });

  describe('decode error paths', () => {
    it('throws BadRequestException on malformed base64', () => {
      expect(() => CursorCodec.decode('!!!not base64!!!')).toThrow(BadRequestException);
      expect(() => CursorCodec.decode('!!!not base64!!!')).toThrow('Invalid cursor');
    });

    it('throws BadRequestException on valid base64 but non-JSON payload', () => {
      const garbage = Buffer.from('not json at all', 'utf8').toString('base64url');
      expect(() => CursorCodec.decode(garbage)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when sortField is missing', () => {
      const bad = Buffer.from(JSON.stringify({ id: 1, dir: 'next', sortValue: 'x' }), 'utf8').toString('base64url');
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when dir is missing', () => {
      const bad = Buffer.from(JSON.stringify({ sortField: 'x', id: 1, sortValue: 'x' }), 'utf8').toString('base64url');
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });

    it("throws BadRequestException when dir is not 'next' or 'prev'", () => {
      const bad = Buffer.from(
        JSON.stringify({ sortField: 'x', id: 1, dir: 'sideways', sortValue: 'x' }),
        'utf8',
      ).toString('base64url');
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when id is missing', () => {
      const bad = Buffer.from(JSON.stringify({ sortField: 'x', dir: 'next', sortValue: 'x' }), 'utf8').toString(
        'base64url',
      );
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when sortValue is missing', () => {
      const bad = Buffer.from(JSON.stringify({ sortField: 'x', dir: 'next', id: 1 }), 'utf8').toString('base64url');
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when payload is JSON null', () => {
      const bad = Buffer.from('null', 'utf8').toString('base64url');
      expect(() => CursorCodec.decode(bad)).toThrow(BadRequestException);
    });
  });

  describe('length cap (DoS surface)', () => {
    it('throws BadRequestException when token exceeds 1024 chars BEFORE base64-decode', () => {
      const oversized = 'a'.repeat(1025);
      expect(() => CursorCodec.decode(oversized)).toThrow(BadRequestException);
      expect(() => CursorCodec.decode(oversized)).toThrow('Cursor token exceeds maximum length');
    });
  });
});
