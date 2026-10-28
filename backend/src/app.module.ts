import { Module } from '@nestjs/common';
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
import { AddChannelStats1760852400000 } from './migrations/1760852400000-AddChannelStats';
import { AddChannelVerified1760860800000 } from './migrations/1760860800000-AddChannelVerified';
import { AddChannelDiscovery1761019200000 } from './migrations/1761019200000-AddChannelDiscovery';
import { AddCollectError1761033600000 } from './migrations/1761033600000-AddCollectError';
import { AddCollectClassifyCache1761040800000 } from './migrations/1761040800000-AddCollectClassifyCache';
import { AddChannelLanguage1761120000000 } from './migrations/1761120000000-AddChannelLanguage';
import { AddChannelVisibility1761210000000 } from './migrations/1761210000000-AddChannelVisibility';
import { AddMtprotoCollectColumns1761220000000 } from './migrations/1761220000000-AddMtprotoCollectColumns';
import { AddSnapshotActivity1761230000000 } from './migrations/1761230000000-AddSnapshotActivity';
import { AddLanguageHangulRatio1761240000000 } from './migrations/1761240000000-AddLanguageHangulRatio';
import { AddStatsRuns1761260000000 } from './migrations/1761260000000-AddStatsRuns';
import { AddUuidPkDefaults1761270000000 } from './migrations/1761270000000-AddUuidPkDefaults';
import { AddStatsRunMode1761280000000 } from './migrations/1761280000000-AddStatsRunMode';
import { AddAccessHashAndMtprotoState1761290000000 } from './migrations/1761290000000-AddAccessHashAndMtprotoState';
import { AddChannelCollectTier1761300000000 } from './migrations/1761300000000-AddChannelCollectTier';
import { AddAdminInspectJobs1761320000000 } from './migrations/1761320000000-AddAdminInspectJobs';
import { AddDiscoveryKeywords1761330000000 } from './migrations/1761330000000-AddDiscoveryKeywords';
import { AddRewardPayoutLedger1761340000000 } from './migrations/1761340000000-AddRewardPayoutLedger';
import { AddIllegalCleared1761350000000 } from './migrations/1761350000000-AddIllegalCleared';
import { AddSearchTerms1761360000000 } from './migrations/1761360000000-AddSearchTerms';
import { AddSearchLogs1761370000000 } from './migrations/1761370000000-AddSearchLogs';
import { AddTelegramOpens1761380000000 } from './migrations/1761380000000-AddTelegramOpens';
import { AddTitleLocked1761390000000 } from './migrations/1761390000000-AddTitleLocked';
import { AddChannelNextCollectAt1761400000000 } from './migrations/1761400000000-AddChannelNextCollectAt';
import { AddLinkedChat1761410000000 } from './migrations/1761410000000-AddLinkedChat';
import { AddMemberDeltas1761420000000 } from './migrations/1761420000000-AddMemberDeltas';
import { AddCategoryProposals1761430000000 } from './migrations/1761430000000-AddCategoryProposals';
import { AddCategorySuggestionsAndNotifications1761440000000 } from './migrations/1761440000000-AddCategorySuggestionsAndNotifications';
import { AddRewardToggleLog1761450000000 } from './migrations/1761450000000-AddRewardToggleLog';
import { AddAdBanners1761460000000 } from './migrations/1761460000000-AddAdBanners';
import { AddRankAds1761470000000 } from './migrations/1761470000000-AddRankAds';
import { AddAdPayments1761480000000 } from './migrations/1761480000000-AddAdPayments';
import { AddUserAdvertiser1761490000000 } from './migrations/1761490000000-AddUserAdvertiser';
import { AddAdAdvertiserAndStats1761500000000 } from './migrations/1761500000000-AddAdAdvertiserAndStats';
import { AddStoredImages1761510000000 } from './migrations/1761510000000-AddStoredImages';
import { AddChannelPostsPostedAtIndex1761520000000 } from './migrations/1761520000000-AddChannelPostsPostedAtIndex';
import { StoredImagesModule } from './stored-images/stored-images.module';
import { ServerStatusModule } from './server-status/server-status.module';

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
              migrations: [
                AddChannelStats1760852400000,
                AddChannelVerified1760860800000,
                AddChannelDiscovery1761019200000,
                AddCollectError1761033600000,
                AddCollectClassifyCache1761040800000,
                AddChannelLanguage1761120000000,
                AddChannelVisibility1761210000000,
                AddMtprotoCollectColumns1761220000000,
                AddSnapshotActivity1761230000000,
                AddLanguageHangulRatio1761240000000,
                AddStatsRuns1761260000000,
                AddUuidPkDefaults1761270000000,
                AddStatsRunMode1761280000000,
                AddAccessHashAndMtprotoState1761290000000,
                AddChannelCollectTier1761300000000,
                AddAdminInspectJobs1761320000000,
                AddDiscoveryKeywords1761330000000,
                AddRewardPayoutLedger1761340000000,
                AddIllegalCleared1761350000000,
                AddSearchTerms1761360000000,
                AddSearchLogs1761370000000,
                AddTelegramOpens1761380000000,
                AddTitleLocked1761390000000,
                AddChannelNextCollectAt1761400000000,
                AddLinkedChat1761410000000,
                AddMemberDeltas1761420000000,
                AddCategoryProposals1761430000000,
                AddCategorySuggestionsAndNotifications1761440000000,
                AddRewardToggleLog1761450000000,
                AddAdBanners1761460000000,
                AddRankAds1761470000000,
                AddAdPayments1761480000000,
                AddUserAdvertiser1761490000000,
                AddAdAdvertiserAndStats1761500000000,
                AddStoredImages1761510000000,
                AddChannelPostsPostedAtIndex1761520000000,
              ],
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
            migrations: [
              AddChannelStats1760852400000,
              AddChannelVerified1760860800000,
              AddChannelDiscovery1761019200000,
              AddCollectError1761033600000,
              AddCollectClassifyCache1761040800000,
              AddChannelLanguage1761120000000,
              AddChannelVisibility1761210000000,
              AddMtprotoCollectColumns1761220000000,
              AddSnapshotActivity1761230000000,
              AddLanguageHangulRatio1761240000000,
              AddStatsRuns1761260000000,
              AddUuidPkDefaults1761270000000,
              AddStatsRunMode1761280000000,
              AddAccessHashAndMtprotoState1761290000000,
              AddChannelCollectTier1761300000000,
              AddAdminInspectJobs1761320000000,
              AddDiscoveryKeywords1761330000000,
              AddRewardPayoutLedger1761340000000,
              AddIllegalCleared1761350000000,
              AddSearchTerms1761360000000,
              AddSearchLogs1761370000000,
              AddTelegramOpens1761380000000,
              AddTitleLocked1761390000000,
              AddChannelNextCollectAt1761400000000,
              AddLinkedChat1761410000000,
              AddMemberDeltas1761420000000,
              AddCategoryProposals1761430000000,
              AddCategorySuggestionsAndNotifications1761440000000,
              AddRewardToggleLog1761450000000,
              AddAdBanners1761460000000,
              AddRankAds1761470000000,
              AddAdPayments1761480000000,
              AddUserAdvertiser1761490000000,
              AddAdAdvertiserAndStats1761500000000,
              AddStoredImages1761510000000,
              AddChannelPostsPostedAtIndex1761520000000,
            ],
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
          migrations: [
            AddChannelStats1760852400000,
            AddChannelVerified1760860800000,
            AddChannelDiscovery1761019200000,
            AddCollectError1761033600000,
            AddCollectClassifyCache1761040800000,
            AddChannelLanguage1761120000000,
            AddChannelVisibility1761210000000,
            AddMtprotoCollectColumns1761220000000,
            AddSnapshotActivity1761230000000,
            AddLanguageHangulRatio1761240000000,
            AddStatsRuns1761260000000,
            AddUuidPkDefaults1761270000000,
            AddStatsRunMode1761280000000,
            AddAccessHashAndMtprotoState1761290000000,
            AddChannelCollectTier1761300000000,
            AddAdminInspectJobs1761320000000,
            AddDiscoveryKeywords1761330000000,
            AddRewardPayoutLedger1761340000000,
            AddIllegalCleared1761350000000,
            AddSearchTerms1761360000000,
            AddSearchLogs1761370000000,
            AddTelegramOpens1761380000000,
            AddTitleLocked1761390000000,
            AddChannelNextCollectAt1761400000000,
            AddLinkedChat1761410000000,
            AddMemberDeltas1761420000000,
            AddCategoryProposals1761430000000,
            AddCategorySuggestionsAndNotifications1761440000000,
            AddRewardToggleLog1761450000000,
            AddAdBanners1761460000000,
            AddRankAds1761470000000,
            AddAdPayments1761480000000,
            AddUserAdvertiser1761490000000,
            AddAdAdvertiserAndStats1761500000000,
            AddStoredImages1761510000000,
            AddChannelPostsPostedAtIndex1761520000000,
          ],
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
    ServerStatusModule,
    AutoManageModule,
    PaymentsModule,
    RankingModule,
    StatsModule,
    SeoModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
