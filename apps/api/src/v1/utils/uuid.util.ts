import { HttpStatus } from '@nestjs/common';
import { ApiError } from './respond.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Validates an optional uuid query param; a malformed one is a 400, not a driver error. */
export function optionalUuid(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isUuid(value)) {
    throw new ApiError(
      'bad_request',
      `'${name}' must be a valid UUID`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

/** Validates an array of uuids (e.g. contact_ids). */
export function requireUuidArray(value: unknown[], name: string): string[] {
  if (!value.every(isUuid)) {
    throw new ApiError(
      'bad_request',
      `'${name}' must contain only valid UUIDs`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value as string[];
}
