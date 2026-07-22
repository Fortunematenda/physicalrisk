import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get('API_PORT') ?? 4000);
  const corsOrigin = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOrigin.split(',').map((item) => item.trim()), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Physical Risk Repository Import Gateway')
    .setDescription('RFP-001 v1.1 approved-document import gateway API')
    .setVersion('1.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port, '0.0.0.0');
  console.log(`Gateway API listening on http://localhost:${port}/api`);
}

bootstrap();
