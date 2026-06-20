import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'NEWLINK API',
      status: 'ok',
      endpoints: {
        search: 'GET /api/channels/search',
        submit: 'POST /api/channels',
        recommend: 'POST /api/channels/:id/recommend',
        adminPending: 'GET /api/admin/channels/pending',
        paymentInvoice: 'POST /api/payments/invoice',
      },
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}