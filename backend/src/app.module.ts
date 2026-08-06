import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ChannelsModule } from './channels/channels.module';
import { PaymentsModule } from './payments/payments.module';
import { AutoManageModule } from './auto-manage/auto-manage.module';
import { RankingModule } from './ranking/ranking.module';
import { UsersModule } from './users/users.module';

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = (config.get<string>('DATABASE_URL') ?? '').trim();
        const dbType = (config.get<string>('DATABASE_TYPE') ?? 'sqlite').trim().toLowerCase();
        const isProd = config.get<string>('NODE_ENV') === 'production';
        // 운영 첫 배포·스키마 추가 시에만 true. 안정화 후 false 권장.
        const synchronize = truthy(config.get<string>('TYPEORM_SYNC')) || !isProd;

        if (databaseUrl || dbType === 'postgres' || dbType === 'postgresql') {
          const sslDisabled = truthy(config.get<string>('DATABASE_SSL_DISABLE'));

          if (databaseUrl) {
            return {
              type: 'postgres',
              url: databaseUrl,
              autoLoadEntities: true,
              synchronize,
              ssl: sslDisabled ? false : { rejectUnauthorized: false },
            };
          }

          return {
            type: 'postgres',
            host: config.get<string>('DATABASE_HOST', 'localhost'),
            port: Number(config.get('DATABASE_PORT') ?? 5432),
            username: config.get<string>('DATABASE_USER', 'newlink'),
            password: config.get<string>('DATABASE_PASSWORD', 'newlink_secret'),
            database: config.get<string>('DATABASE_NAME', 'newlink'),
            autoLoadEntities: true,
            synchronize,
            ssl: sslDisabled ? false : { rejectUnauthorized: false },
          };
        }

        return {
          type: 'better-sqlite3' as const,
          database: config.get<string>('DATABASE_PATH', 'data/newlink.sqlite'),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    ChannelsModule,
    AdminModule,
    AutoManageModule,
    PaymentsModule,
    RankingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
