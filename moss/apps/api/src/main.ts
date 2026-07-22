import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const config = app.get(ConfigService);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  const origins = (config.get<string>('CORS_ORIGINS') || 'http://localhost:3000').split(',').map(v => v.trim());
  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['content-disposition'] });
  await app.listen(Number(config.get('PORT') || 4000), '0.0.0.0');
}
bootstrap();
