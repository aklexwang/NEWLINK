import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TonPaymentService } from './ton-payment.service';

@Controller('admin/ton-payments')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminTonPaymentsController {
  constructor(private readonly tonPaymentService: TonPaymentService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.tonPaymentService.list(q);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tonPaymentService.remove(id);
  }
}
