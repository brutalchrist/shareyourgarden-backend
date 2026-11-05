import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = parseCorsOrigins(
    config.get<string>('CORS_ORIGINS', 'http://localhost:3000'),
  );

  app.enableCors({
    origin: origins,
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.listen(process.env.PORT ?? 1337);
}
bootstrap();
