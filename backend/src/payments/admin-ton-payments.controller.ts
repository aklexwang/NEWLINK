import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TonPaymentService } from './ton-payment.service';

class CreateTonPaymentDto {
  @IsString()
  channelId: string;

  @IsNumber()
  @Min(0.000001)
  amount: number;

  @IsString()
  @MaxLength(256)
  wallet: string;

  @IsOptional()
  @IsIn(['tonconnect', 'external'])
  method?: 'tonconnect' | 'external';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  @IsOptional()
  @IsNumber()
  telegramId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reporterName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  channelTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  channelLink?: string;
}

@Controller('admin/ton-payments')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminTonPaymentsController {
  constructor(private readonly tonPaymentService: TonPaymentService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.tonPaymentService.list(q);
  }

  @Post()
  create(@Body() dto: CreateTonPaymentDto) {
    return this.tonPaymentService.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tonPaymentService.remove(id);
  }
}
