import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID ??= 'test-client-id';
    process.env.JWT_SECRET ??= 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('adds a code to error responses', () => {
    return request(app.getHttpServer()).get('/does-not-exist').expect(404, {
      statusCode: 404,
      message: 'Cannot GET /does-not-exist',
      error: 'Not Found',
      code: 'NOT_FOUND',
    });
  });
});
