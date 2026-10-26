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
  // Render 등 프록시 한 단계 뒤의 클라이언트 IP (관리자 로그인 잠금)
  app.set('trust proxy', 1);
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
  });
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
  console.log(`TellLink API listening on 0.0.0.0:${port}`);
}
void bootstrap();
