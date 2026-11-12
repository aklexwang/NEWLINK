import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MiniAppGateMiddleware } from './security/miniapp-gate.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AdsModule } from './ads/ads.module';
import { DailyCountersModule } from './daily-counters/daily-counters.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ChannelsModule } from './channels/channels.module';
import { PaymentsModule } from './payments/payments.module';
import { AutoManageModule } from './auto-manage/auto-manage.module';
import { RankingModule } from './ranking/ranking.module';
import { SeoModule } from './seo/seo.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';
import { isPostgresConfig } from './common/db-types';
import { MemberActivityModule } from './member-activity/member-activity.module';
import { StoredImagesModule } from './stored-images/stored-images.module';
import { ServerStatusModule } from './server-status/server-status.module';
import { ALL_MIGRATIONS } from './migrations';

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (value ?? '').trim().toLowerCase(),
  );
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = (config.get<string>('DATABASE_URL') ?? '').trim();
        const isProd = config.get<string>('NODE_ENV') === 'production';
        // 운영 첫 배포·스키마 추가 시에만 true. 안정화 후 false 권장.
        const synchronize =
          truthy(config.get<string>('TYPEORM_SYNC')) || !isProd;

        if (
          isPostgresConfig({
            DATABASE_URL: config.get<string>('DATABASE_URL'),
            DATABASE_TYPE: config.get<string>('DATABASE_TYPE'),
          })
        ) {
          const sslDisabled = truthy(
            config.get<string>('DATABASE_SSL_DISABLE'),
          );

          if (databaseUrl) {
            return {
              type: 'postgres',
              url: databaseUrl,
              autoLoadEntities: true,
              synchronize,
              migrations: ALL_MIGRATIONS,
              migrationsRun: !synchronize,
              ssl: sslDisabled ? false : { rejectUnauthorized: false },
              retryAttempts: 20,
              retryDelay: 3000,
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
            migrations: ALL_MIGRATIONS,
            migrationsRun: !synchronize,
            ssl: sslDisabled ? false : { rejectUnauthorized: false },
            retryAttempts: 20,
            retryDelay: 3000,
          };
        }

        return {
          type: 'better-sqlite3' as const,
          database: config.get<string>('DATABASE_PATH', 'data/newlink.sqlite'),
          autoLoadEntities: true,
          synchronize: true,
          migrations: ALL_MIGRATIONS,
        };
      },
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    ChannelsModule,
    AdminModule,
    AdsModule,
    DailyCountersModule,
    StoredImagesModule,
    MemberActivityModule,
    ServerStatusModule,
    AutoManageModule,
    PaymentsModule,
    RankingModule,
    StatsModule,
    SeoModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  /** 공개 API 는 텔레그램 미니앱(서명)·관리자만 — 목록 대량 수집 막기 */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MiniAppGateMiddleware).forRoutes('*');
  }
}
