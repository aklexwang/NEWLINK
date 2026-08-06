import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

function ensureUploadDirs() {
  const root = join(process.cwd(), 'uploads');
  for (const dir of [root, join(root, 'channels'), join(root, 'categories')]) {
    mkdirSync(dir, { recursive: true });
  }
}

async function bootstrap() {
  ensureUploadDirs();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/api/uploads/' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`NEWLINK API listening on 0.0.0.0:${port}`);
}
bootstrap();
