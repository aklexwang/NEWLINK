import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Notice } from './notice.entity';

export type NoticeInput = {
  title?: unknown;
  body?: unknown;
  pinned?: unknown;
  published?: unknown;
};

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(Notice)
    private readonly repo: Repository<Notice>,
  ) {}

  /** 회원용: 보이는 공지, 고정 먼저 → 최신 순 */
  async listPublic() {
    const rows = await this.repo.find({
      where: { published: true },
      order: { pinned: 'DESC', createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      createdAt: n.createdAt,
    }));
  }

  listAdmin() {
    return this.repo.find({ order: { pinned: 'DESC', createdAt: 'DESC' } });
  }

  async create(input: NoticeInput) {
    const title = cleanText(input.title, 120);
    if (!title) throw new BadRequestException('제목을 입력해 주세요.');
    const row = this.repo.create({
      id: randomUUID(),
      title,
      body: cleanText(input.body, 4000),
      pinned: input.pinned === true,
      published: input.published !== false,
    });
    return this.repo.save(row);
  }

  async update(id: string, input: NoticeInput) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('공지를 찾지 못했어요.');
    if (input.title !== undefined) {
      const title = cleanText(input.title, 120);
      if (!title) throw new BadRequestException('제목을 입력해 주세요.');
      row.title = title;
    }
    if (input.body !== undefined) row.body = cleanText(input.body, 4000);
    if (typeof input.pinned === 'boolean') row.pinned = input.pinned;
    if (typeof input.published === 'boolean') row.published = input.published;
    return this.repo.save(row);
  }

  async remove(id: string) {
    await this.repo.delete({ id });
    return { ok: true };
  }
}
