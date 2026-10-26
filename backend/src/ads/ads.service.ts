import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdBanner } from './ad-banner.entity';
import { AppSetting } from './app-setting.entity';
import {
  BANNER_MAX_BYTES,
  BANNER_ROTATE_KEY,
  isBannerLive,
  kstDateBoundary,
  normalizeBannerLink,
  parseRotateSeconds,
  sniffImageMime,
} from './ad-banner.logic';
import { applyPayment, daysLeft } from './ad-payment.logic';

export type BannerInput = {
  title?: unknown;
  link?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
  paidUsdt?: unknown;
  paidOn?: unknown;
};

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1' || value === 1;
}

@Injectable()
export class AdsService {
  private publicCache: { at: number; value: unknown } | null = null;

  constructor(
    @InjectRepository(AdBanner)
    private readonly bannerRepository: Repository<AdBanner>,
    @InjectRepository(AppSetting)
    private readonly settingRepository: Repository<AppSetting>,
  ) {}

  async rotateSeconds(): Promise<number> {
    const row = await this.settingRepository.findOne({
      where: { key: BANNER_ROTATE_KEY },
    });
    return parseRotateSeconds(row?.value);
  }

  async setRotateSeconds(raw: unknown): Promise<number> {
    const seconds = parseRotateSeconds(raw);
    await this.settingRepository.save({
      key: BANNER_ROTATE_KEY,
      value: String(seconds),
    });
    this.publicCache = null;
    return seconds;
  }

  private publicShape(banner: AdBanner) {
    return {
      id: banner.id,
      title: banner.title,
      link: banner.link,
      imageUrl: `/api/ads/banners/${banner.id}/image?v=${banner.imageVersion}`,
    };
  }

  /** 회원 홈: 지금 보여 줄 배너 + 넘김 간격(1분 캐시) */
  async listPublic() {
    if (this.publicCache && Date.now() - this.publicCache.at < 60_000) {
      return this.publicCache.value;
    }
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    const now = new Date();
    const value = {
      rotateSeconds: await this.rotateSeconds(),
      banners: rows
        .filter((row) => isBannerLive(row, now))
        .map((row) => this.publicShape(row)),
    };
    this.publicCache = { at: Date.now(), value };
    return value;
  }

  async image(id: string): Promise<{ mime: string; data: Buffer }> {
    const row = await this.bannerRepository
      .createQueryBuilder('b')
      .addSelect('b.imageData')
      .where('b.id = :id', { id })
      .getOne();
    if (!row) throw new NotFoundException('배너가 없습니다.');
    return { mime: row.imageMime, data: Buffer.from(row.imageData) };
  }

  async click(id: string): Promise<void> {
    await this.bannerRepository.increment({ id }, 'clicks', 1);
  }

  /** 어드민 목록(이미지 데이터 빼고) */
  async listAdmin() {
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    const now = new Date();
    return {
      rotateSeconds: await this.rotateSeconds(),
      banners: rows.map((row) => ({
        ...this.publicShape(row),
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        clicks: row.clicks,
        paidUsdt: row.paidUsdt,
        paidOn: row.paidOn,
        daysLeft: daysLeft(row.endsAt, now),
        live: isBannerLive(row, now),
        createdAt: row.createdAt,
      })),
    };
  }

  private checkImage(file: { buffer?: Buffer; size?: number } | undefined) {
    if (!file?.buffer?.length)
      throw new BadRequestException('배너 이미지를 올려 주세요.');
    if (file.buffer.length > BANNER_MAX_BYTES) {
      throw new BadRequestException('이미지는 1MB 이하로 올려 주세요.');
    }
    const mime = sniffImageMime(file.buffer);
    if (!mime)
      throw new BadRequestException('JPG·PNG·WebP 이미지만 올릴 수 있어요.');
    return { mime, data: file.buffer };
  }

  private applyInput(
    row: Partial<AdBanner>,
    input: BannerInput,
    creating: boolean,
  ) {
    if (input.title !== undefined || creating) {
      const title =
        typeof input.title === 'string' ? input.title.trim().slice(0, 100) : '';
      if (!title) throw new BadRequestException('광고 이름을 넣어 주세요.');
      row.title = title;
    }
    if (input.link !== undefined || creating) {
      const link = normalizeBannerLink(input.link);
      if (!link)
        throw new BadRequestException('텔레그램 링크(t.me/…)를 넣어 주세요.');
      row.link = link;
    }
    if (input.startsOn !== undefined)
      row.startsAt = kstDateBoundary(input.startsOn, false);
    if (input.endsOn !== undefined)
      row.endsAt = kstDateBoundary(input.endsOn, true);
    if (input.sortOrder !== undefined) {
      const n = Math.trunc(Number(input.sortOrder));
      row.sortOrder = Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 0;
    }
    if (input.isActive !== undefined || creating) {
      row.isActive = toBool(input.isActive, true);
    }
    applyPayment(row, input);
  }

  async create(
    input: BannerInput,
    file: { buffer?: Buffer; size?: number } | undefined,
  ) {
    const image = this.checkImage(file);
    const row: Partial<AdBanner> = {
      id: randomUUID(),
      imageMime: image.mime,
      imageData: image.data,
      imageVersion: Date.now().toString(36),
      clicks: 0,
      sortOrder: 0,
      startsAt: null,
      endsAt: null,
    };
    this.applyInput(row, input, true);
    await this.bannerRepository.insert(row);
    this.publicCache = null;
    return { id: row.id };
  }

  async update(
    id: string,
    input: BannerInput,
    file: { buffer?: Buffer; size?: number } | undefined,
  ) {
    const existing = await this.bannerRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('배너가 없습니다.');
    const patch: Partial<AdBanner> = {};
    this.applyInput(patch, input, false);
    if (file?.buffer?.length) {
      const image = this.checkImage(file);
      patch.imageMime = image.mime;
      patch.imageData = image.data;
      patch.imageVersion = Date.now().toString(36);
    }
    if (Object.keys(patch).length > 0)
      await this.bannerRepository.update(id, patch);
    this.publicCache = null;
    return { id };
  }

  async remove(id: string) {
    await this.bannerRepository.delete({ id });
    this.publicCache = null;
    return { ok: true };
  }
}
