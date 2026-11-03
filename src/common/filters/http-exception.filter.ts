import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ErrorCode } from '../errors';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  code: string;
}

const codeFromStatus = (status: number): string =>
  status >= 500
    ? ErrorCode.INTERNAL_ERROR
    : (STATUS_CODES[status] ?? 'Error')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_');

/**
 * Keeps Nest's error body (`statusCode`, `message`, `error`) and adds a
 * stable `code`. Throw sites can name one by passing `{ message, code }` to
 * the exception; otherwise it comes from the status, except for
 * ValidationPipe failures (400 with a list of messages), which get
 * VALIDATION_FAILED.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception,
        exception instanceof Error ? exception.stack : undefined,
      );

      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR],
        code: ErrorCode.INTERNAL_ERROR,
      };
    }

    const statusCode = exception.getStatus();
    const raw = exception.getResponse();
    const fields: Partial<ErrorBody> =
      typeof raw === 'string' ? { message: raw } : raw;
    const message = fields.message ?? exception.message;
    const defaultCode =
      statusCode === 400 && Array.isArray(message)
        ? ErrorCode.VALIDATION_FAILED
        : codeFromStatus(statusCode);

    return {
      ...fields,
      statusCode,
      message,
      error: fields.error ?? STATUS_CODES[statusCode],
      code: fields.code ?? defaultCode,
    };
  }
}
