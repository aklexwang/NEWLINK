import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { CreateInvoiceDto } from './dto/payments.dto';
import type { TelegramWebhookUpdate } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('invoice')
  @UseGuards(TelegramAuthGuard)
  createInvoice(
    @Body() dto: CreateInvoiceDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.paymentsService.createPromotionInvoice(dto, user.id);
  }

  @Post('webhook')
  async webhook(@Body() update: TelegramWebhookUpdate) {
    await this.paymentsService.handleWebhook(update);
    return { ok: true };
  }
}
