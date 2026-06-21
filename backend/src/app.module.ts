import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ChannelsModule } from './channels/channels.module';
import { PaymentsModule } from './payments/payments.module';
import { RankingModule } from './ranking/ranking.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const dbType = config.get<string>('DATABASE_TYPE', 'sqlite');

        if (dbType === 'sqlite') {
          return {
            type: 'better-sqlite3',
            database: config.get<string>('DATABASE_PATH', 'data/newlink.sqlite'),
            autoLoadEntities: true,
            synchronize: true,
          };
        }

        return {
          type: 'postgres',
          host: config.get('DATABASE_HOST', 'localhost'),
          port: config.get<number>('DATABASE_PORT', 5432),
          username: config.get('DATABASE_USER', 'newlink'),
          password: config.get('DATABASE_PASSWORD', 'newlink_secret'),
          database: config.get('DATABASE_NAME', 'newlink'),
          autoLoadEntities: true,
          synchronize: config.get('NODE_ENV') !== 'production',
        };
      },
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    ChannelsModule,
    AdminModule,
    PaymentsModule,
    RankingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}