import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const DEFAULT_CATEGORIES = [
  { name: '뉴스', emoji: '📰', sortOrder: 1 },
  { name: '커뮤니티', emoji: '👥', sortOrder: 2 },
  { name: '쇼핑', emoji: '🛒', sortOrder: 3 },
  { name: '교육', emoji: '📚', sortOrder: 4 },
  { name: '엔터테인먼트', emoji: '🎬', sortOrder: 5 },
  { name: '기타', emoji: '📁', sortOrder: 6 },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {}

  async onModuleInit() {
    const count = await this.categoryRepository.count();
    if (count > 0) return;
    await this.categoryRepository.save(DEFAULT_CATEGORIES);
  }

  findActive() {
    return this.categoryRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  findAll() {
    return this.categoryRepository.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const exists = await this.categoryRepository.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('이미 존재하는 카테고리입니다.');

    const category = this.categoryRepository.create({
      name: dto.name,
      emoji: dto.emoji ?? '📁',
      iconUrl: dto.iconUrl ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.categoryRepository.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.findById(id);

    if (dto.name && dto.name !== category.name) {
      const exists = await this.categoryRepository.findOne({ where: { name: dto.name } });
      if (exists) throw new ConflictException('이미 존재하는 카테고리입니다.');
      category.name = dto.name;
    }
    if (dto.emoji !== undefined) category.emoji = dto.emoji;
    if (dto.iconUrl !== undefined) category.iconUrl = dto.iconUrl;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.categoryRepository.save(category);
  }

  async remove(id: string) {
    const category = await this.findById(id);
    await this.categoryRepository.remove(category);
    return { ok: true };
  }

  private async findById(id: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('카테고리를 찾을 수 없습니다.');
    return category;
  }
}