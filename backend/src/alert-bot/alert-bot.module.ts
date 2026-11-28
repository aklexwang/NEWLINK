import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { AlertBotController } from './alert-bot.controller';
import { AlertBotService } from './alert-bot.service';

/** 관리자 알림 전용 봇 (TellLink 제품 봇과 별개) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [AlertBotController],
  providers: [AlertBotService],
  exports: [AlertBotService],
})
export class AlertBotModule {}
