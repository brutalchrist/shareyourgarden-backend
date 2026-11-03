import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

const catchWith = (exception: unknown) => {
  const status = jest.fn<unknown, [number]>();
  const json = jest.fn<unknown, [Record<string, unknown>]>();
  const response = { status, json };
  status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  expect(status).toHaveBeenCalledTimes(1);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
};

describe('HttpExceptionFilter', () => {
  it('derives the code from the status when the throw site names none', () => {
    expect(catchWith(new UnauthorizedException())).toEqual({
      status: 401,
      body: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
    expect(catchWith(new ForbiddenException('Nope')).body).toEqual({
      statusCode: 403,
      message: 'Nope',
      error: 'Forbidden',
      code: 'FORBIDDEN',
    });
    expect(catchWith(new HttpException('Slow down', 429)).body).toEqual({
      statusCode: 429,
      message: 'Slow down',
      error: 'Too Many Requests',
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('keeps the code a throw site names', () => {
    expect(
      catchWith(
        new NotFoundException({
          message: 'Garden not found',
          code: 'GARDEN_NOT_FOUND',
        }),
      ),
    ).toEqual({
      status: 404,
      body: {
        statusCode: 404,
        message: 'Garden not found',
        error: 'Not Found',
        code: 'GARDEN_NOT_FOUND',
      },
    });
  });

  it('marks ValidationPipe failures as VALIDATION_FAILED', () => {
    const exception = new BadRequestException(['locale must be one of es, en']);

    expect(catchWith(exception).body).toEqual({
      statusCode: 400,
      message: ['locale must be one of es, en'],
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    expect(catchWith(new Error('database exploded'))).toEqual({
      status: 500,
      body: {
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
      },
    });
  });
});
