import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { UsersService } from '../users/users.service';
import { CreateInvoiceDto } from './dto/payments.dto';
import type { TelegramWebhookUpdate } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  @Post('invoice')
  @UseGuards(TelegramAuthGuard)
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.paymentsService.createPromotionInvoice(dto, user.id);
  }

  @Post('webhook')
  async webhook(@Body() update: TelegramWebhookUpdate) {
    await this.paymentsService.handleWebhook(update);
    return { ok: true };
  }
}
