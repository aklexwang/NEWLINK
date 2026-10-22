import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelImportCandidate } from '../auto-manage/channel-import-candidate.entity';
import { Channel } from '../channels/channel.entity';
import { CategoryEntity } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { DEFAULT_CATEGORIES } from './default-categories';

export { DEFAULT_CATEGORIES } from './default-categories';

/** 새 분류로 대체된 옛 카테고리 (비활성) */
const OBSOLETE_CATEGORIES = ['축구'];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelImportCandidate)
    private readonly candidateRepository: Repository<ChannelImportCandidate>,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureDefaults();
    } catch (error) {
      console.error(
        '카테고리 초기화 실패(서버는 계속 기동):',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /** 기본 카테고리가 없으면 추가, 있으면 이모지·정렬 동기화 */
  async ensureDefaults() {
    for (const item of DEFAULT_CATEGORIES) {
      const existing = await this.categoryRepository.findOne({
        where: { name: item.name },
      });
      if (!existing) {
        await this.categoryRepository.save(
          this.categoryRepository.create(item),
        );
        continue;
      }
      let dirty = false;
      if (existing.emoji !== item.emoji) {
        existing.emoji = item.emoji;
        dirty = true;
      }
      if (existing.sortOrder !== item.sortOrder) {
        existing.sortOrder = item.sortOrder;
        dirty = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        dirty = true;
      }
      if (dirty) await this.categoryRepository.save(existing);
    }

    for (const name of OBSOLETE_CATEGORIES) {
      const obsolete = await this.categoryRepository.findOne({
        where: { name },
      });
      if (obsolete?.isActive) {
        obsolete.isActive = false;
        await this.categoryRepository.save(obsolete);
      }
    }
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
    const exists = await this.categoryRepository.findOne({
      where: { name: dto.name },
    });
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
    const previousName = category.name;

    if (dto.name && dto.name !== category.name) {
      const nextName = dto.name.trim();
      if (!nextName)
        throw new ConflictException('카테고리 이름을 입력해 주세요.');
      const exists = await this.categoryRepository.findOne({
        where: { name: nextName },
      });
      if (exists) throw new ConflictException('이미 존재하는 카테고리입니다.');
      category.name = nextName;
    }
    if (dto.emoji !== undefined) category.emoji = dto.emoji;
    if (dto.iconUrl !== undefined) category.iconUrl = dto.iconUrl;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    const saved = await this.categoryRepository.save(category);

    if (saved.name !== previousName) {
      await this.channelRepository.update(
        { category: previousName },
        { category: saved.name },
      );
      await this.candidateRepository.update(
        { category: previousName },
        { category: saved.name },
      );
      await this.candidateRepository.update(
        { categoryAiSuggested: previousName },
        { categoryAiSuggested: saved.name },
      );
    }

    return saved;
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
