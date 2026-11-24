import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { ApiError } from './respond.util';

const logger = new Logger('ApiExceptionFilter');

export function mapPrismaCode(
  prismaCode: string,
): { status: number; code: string; message: string } | null {
  switch (prismaCode) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: 'conflict',
        message: 'A record with these values already exists',
      };
    case 'P2023': // malformed uuid etc.
    case 'P2007':
    case 'P2006':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'bad_request',
        message: 'Invalid request parameters',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'not_found',
        message: 'Resource not found',
      };
    default:
      return null;
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal';
    let message = 'Internal server error';
    let headers: Record<string, string> | undefined;

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      code = exception.code;
      message = body.error?.message || exception.message;
      headers = exception.headers;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message =
        typeof res === 'string' ? res : res.message || exception.message;
      if (Array.isArray(message)) {
        message = message.join(', ');
      }
      if (status === HttpStatus.UNAUTHORIZED) code = 'unauthorized';
      else if (status === HttpStatus.FORBIDDEN) code = 'forbidden';
      else if (status === HttpStatus.NOT_FOUND) code = 'not_found';
      else code = 'bad_request';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Driver text names tables, columns and constraints; callers get a
      // class of problem, the real error stays in our logs.
      const mapped = mapPrismaCode(exception.code);
      if (mapped) {
        ({ status, code, message } = mapped);
      } else {
        logger.error(`[v1] unhandled prisma error ${exception.code}`, exception.stack);
        message = 'Internal error';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'bad_request';
      message = 'Invalid request parameters';
      logger.warn(`[v1] prisma validation error: ${exception.message}`);
    } else {
      // Never echo exception.message: it can carry Prisma/driver text.
      logger.error(
        '[v1] unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
      message = 'Internal error';
    }

    if (headers) {
      for (const [key, val] of Object.entries(headers)) {
        response.setHeader(key, val);
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
      },
    });
  }
}
