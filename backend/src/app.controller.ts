import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'TellLink API',
      status: 'ok',
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
