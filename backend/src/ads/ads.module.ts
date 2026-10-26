import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdBanner } from './ad-banner.entity';
import {
  AdminAdBannersController,
  PublicAdsController,
} from './ads.controller';
import { AdsService } from './ads.service';
import { AppSetting } from './app-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdBanner, AppSetting])],
  controllers: [PublicAdsController, AdminAdBannersController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
