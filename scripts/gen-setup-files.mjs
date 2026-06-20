import fs from 'fs';
import path from 'path';

const root = 'C:/Users/KCadmin/Desktop/NEWLINK';

const fileList = [
  'backend/src/main.ts',
  'backend/src/app.module.ts',
  'backend/src/auth/interfaces/telegram-user.interface.ts',
  'backend/src/auth/telegram-auth.service.ts',
  'backend/src/auth/telegram-auth.guard.ts',
  'backend/src/auth/telegram-admin.guard.ts',
  'backend/src/auth/telegram-user.decorator.ts',
  'backend/src/auth/auth.module.ts',
  'backend/src/channels/channel.entity.ts',
  'backend/src/channels/dto/channel.dto.ts',
  'backend/src/channels/channels.service.ts',
  'backend/src/channels/channels.controller.ts',
  'backend/src/channels/channels.module.ts',
  'backend/src/admin/dto/admin.dto.ts',
  'backend/src/admin/admin.controller.ts',
  'backend/src/admin/admin.module.ts',
  'backend/src/payments/dto/payments.dto.ts',
  'backend/src/payments/payments.service.ts',
  'backend/src/payments/payments.controller.ts',
  'backend/src/payments/payments.module.ts',
  'frontend/vite.config.ts',
  'frontend/src/index.css',
  'frontend/src/types/channel.ts',
  'frontend/src/api/client.ts',
  'frontend/src/api/channels.ts',
  'frontend/src/hooks/useTelegram.ts',
  'frontend/src/components/SearchBar.tsx',
  'frontend/src/components/ChannelCard.tsx',
  'frontend/src/components/ChannelList.tsx',
  'frontend/src/pages/HomePage.tsx',
  'frontend/src/App.tsx',
  'frontend/src/main.tsx',
];

const overrides = {
  'backend/src/main.ts': `import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`,
  'backend/src/app.module.ts': `import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'newlink'),
        password: config.get('DATABASE_PASSWORD', 'newlink_secret'),
        database: config.get('DATABASE_NAME', 'newlink'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    ChannelsModule,
    AdminModule,
    PaymentsModule,
  ],
})
export class AppModule {}
`,
  'frontend/src/App.tsx': `import { HomePage } from './pages/HomePage';

export default function App() {
  return <HomePage />;
}
`,
};

function loadContent(rel) {
  if (overrides[rel]) {
    return overrides[rel];
  }
  let content = fs.readFileSync(path.join(root, rel), 'utf8');
  if (rel === 'backend/src/channels/channels.controller.ts') {
    content = content.replace(
      "import { TelegramUser } from '../auth/interfaces/telegram-user.interface';",
      "import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';",
    );
  }
  if (rel === 'backend/src/payments/payments.controller.ts') {
    content = content.replace(
      "import { TelegramUser } from '../auth/interfaces/telegram-user.interface';",
      "import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';",
    );
    content = content.replace(
      "import { CreateInvoiceDto, TelegramWebhookUpdate } from './dto/payments.dto';",
      "import { CreateInvoiceDto } from './dto/payments.dto';\nimport type { TelegramWebhookUpdate } from './dto/payments.dto';",
    );
  }
  return content;
}

const ps1Header = [
  "$ErrorActionPreference = 'Stop'",
  "$utf8 = New-Object System.Text.UTF8Encoding $false",
  "$root = 'C:\\Users\\KCadmin\\Desktop\\NEWLINK'",
  "",
  "function Write-ProjectFile([string]$RelativePath, [string]$Base64) {",
  "  $full = Join-Path $root $RelativePath",
  "  $dir = Split-Path $full -Parent",
  "  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }",
  "  $bytes = [Convert]::FromBase64String($Base64)",
  "  $text = [Text.Encoding]::UTF8.GetString($bytes)",
  "  [System.IO.File]::WriteAllText($full, $text, $utf8)",
  "}",
  "",
  "Remove-Item -Force (Join-Path $root 'backend/src/app.controller.ts') -ErrorAction SilentlyContinue",
  "Remove-Item -Force (Join-Path $root 'backend/src/app.service.ts') -ErrorAction SilentlyContinue",
  "Remove-Item -Force (Join-Path $root 'backend/src/app.controller.spec.ts') -ErrorAction SilentlyContinue",
  "",
].join('\n') + '\n';

let ps1 = ps1Header;

for (const rel of fileList) {
  const content = loadContent(rel);
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  ps1 += "Write-ProjectFile '" + rel.replace(/'/g, "''") + "' '" + b64 + "'\n";
}

ps1 += "Write-Output 'All project source files written successfully.'\n";

fs.writeFileSync(path.join(root, 'setup-files.ps1'), ps1, 'utf8');
console.log('setup-files.ps1 generated');