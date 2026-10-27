import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { StoredImage } from './stored-image.entity';

export const STORED_IMAGE_PREFIX = '/api/images/';
export const STORED_IMAGE_MAX_BYTES = 512 * 1024;

@Injectable()
export class StoredImagesService {
  constructor(
    @InjectRepository(StoredImage)
    private readonly repo: Repository<StoredImage>,
  ) {}

  /** 저장하고 화면에서 쓸 주소(/api/images/<id>)를 돌려준다 */
  async save(
    kind: 'category-icon' | 'channel-avatar',
    file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
  ): Promise<string> {
    if (!file?.buffer || !file.size) {
      throw new BadRequestException('이미지 파일을 선택해 주세요.');
    }
    if (file.size > STORED_IMAGE_MAX_BYTES) {
      throw new BadRequestException('이미지는 512KB 이하만 올릴 수 있습니다.');
    }
    const id = randomUUID();
    await this.repo.insert({
      id,
      kind,
      mime: (file.mimetype ?? 'image/png').slice(0, 40),
      data: file.buffer,
    });
    return `${STORED_IMAGE_PREFIX}${id}`;
  }

  async read(id: string): Promise<{ mime: string; data: Buffer }> {
    const row = await this.repo
      .createQueryBuilder('i')
      .addSelect('i.data')
      .where('i.id = :id', { id })
      .getOne();
    if (!row) throw new NotFoundException('이미지를 찾을 수 없습니다.');
    return { mime: row.mime, data: Buffer.from(row.data) };
  }
}
