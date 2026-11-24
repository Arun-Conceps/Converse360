import { describe, it, expect, vi } from 'vitest';
import { HttpStatus, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter, mapPrismaCode } from './api-exception.filter';
import { ApiError } from './respond.util';
import { optionalUuid, requireUuidArray } from './uuid.util';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader: vi.fn() }),
    }),
  };
  new ApiExceptionFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('ApiExceptionFilter', () => {
  it('hides raw error text on unknown errors', () => {
    const r = run(new Error('relation "contacts" violates constraint x'));
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe('Internal error');
  });

  it('maps prisma unique violation to 409 without driver text', () => {
    const err = new Prisma.PrismaClientKnownRequestError('secret table text', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const r = run(err);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });

  it('maps malformed-uuid code to 400 and unknown codes to 500', () => {
    expect(mapPrismaCode('P2023')?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapPrismaCode('P9999')).toBeNull();
    const err = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P9999',
      clientVersion: 'x',
    });
    const r = run(err);
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe('Internal error');
  });

  it('keeps ApiError and HttpException messages', () => {
    expect(run(new ApiError('x', 'nope', 400)).body.error.message).toBe('nope');
    expect(run(new BadRequestException('bad')).status).toBe(400);
  });
});

describe('uuid helpers', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  it('accepts valid / empty, rejects junk with 400', () => {
    expect(optionalUuid(id, 'tag')).toBe(id);
    expect(optionalUuid(undefined, 'tag')).toBeUndefined();
    expect(() => optionalUuid('abc', 'tag')).toThrow(ApiError);
    expect(requireUuidArray([id], 'c')).toEqual([id]);
    expect(() => requireUuidArray([id, 'x'], 'c')).toThrow(ApiError);
  });
});
