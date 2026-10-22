import { Controller, Get } from '@nestjs/common';
import { PENDING_CATEGORY } from '../channels/auto-expose.logic';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll() {
    const items = await this.categoriesService.findActive();
    return items.filter((item) => item.name !== PENDING_CATEGORY);
  }
}
