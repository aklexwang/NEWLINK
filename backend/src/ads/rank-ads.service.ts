import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { isBannerLive, kstDateBoundary } from './ad-banner.logic';
import { RankAd } from './rank-ad.entity';
import {
  parseRankAdScope,
  parseRankAdSlot,
  rangesOverlap,
} from './rank-ad.logic';

export type RankAdInput = {
  channelId?: unknown;
  scope?: unknown;
  category?: unknown;
  slot?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  isActive?: unknown;
  memo?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rankAdState(ad: RankAd, now = new Date()) {
  if (!ad.isActive) return 'off' as const;
  if (isBannerLive(ad, now)) return 'live' as const;
  if (ad.startsAt && ad.startsAt.getTime() > now.getTime())
    return 'scheduled' as const;
  return 'ended' as const;
}

/** 어드민: 텔레그램방 순위 광고 관리 */
@Injectable()
export class RankAdsService {
  constructor(
    @InjectRepository(RankAd)
    private readonly repo: Repository<RankAd>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
  ) {}

  async listAdmin() {
    const rows = await this.repo.find({
      order: { scope: 'ASC', category: 'ASC', slot: 'ASC', createdAt: 'DESC' },
    });
    const ids = [...new Set(rows.map((row) => row.channelId))];
    const channels = ids.length
      ? await this.channelRepo.find({
          where: { id: In(ids) },
          select: [
            'id',
            'title',
            'username',
            'link',
            'avatarUrl',
            'category',
            'linkType',
            'memberCount',
            'status',
          ],
        })
      : [];
    const byId = new Map(channels.map((c) => [c.id, c]));
    const now = new Date();
    return rows.map((row) => {
      const ch = byId.get(row.channelId);
      return {
        id: row.id,
        scope: row.scope,
        category: row.category,
        slot: row.slot,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        isActive: row.isActive,
        memo: row.memo,
        clicks: row.clicks,
        state: rankAdState(row, now),
        createdAt: row.createdAt,
        channel: ch
          ? {
              id: ch.id,
              title: ch.title,
              username: ch.username,
              link: ch.link,
              avatarUrl: ch.avatarUrl,
              category: ch.category,
              linkType: ch.linkType,
              memberCount: ch.memberCount,
              status: ch.status,
            }
          : null,
      };
    });
  }

  private async applyInput(row: Partial<RankAd>, input: RankAdInput) {
    if (input.scope !== undefined) {
      const scope = parseRankAdScope(input.scope);
      if (!scope) throw new BadRequestException('광고 종류를 골라 주세요.');
      row.scope = scope;
    }
    if (input.category !== undefined) {
      const category =
        typeof input.category === 'string'
          ? input.category.trim().slice(0, 100)
          : '';
      row.category = category || null;
    }
    if (input.channelId !== undefined) {
      const id = typeof input.channelId === 'string' ? input.channelId : '';
      if (!UUID_RE.test(id))
        throw new BadRequestException('광고할 방을 골라 주세요.');
      const channel = await this.channelRepo.findOne({
        where: { id },
        select: ['id', 'category'],
      });
      if (!channel) throw new BadRequestException('그 방을 찾을 수 없어요.');
      row.channelId = id;
      if (!row.category && row.scope === 'category')
        row.category = channel.category;
    }
    if (input.slot !== undefined) {
      const slot = parseRankAdSlot(input.slot);
      if (!slot)
        throw new BadRequestException('자리는 1~5위 중에서 골라 주세요.');
      row.slot = slot;
    }
    if (input.startsOn !== undefined)
      row.startsAt = kstDateBoundary(input.startsOn, false);
    if (input.endsOn !== undefined)
      row.endsAt = kstDateBoundary(input.endsOn, true);
    if (input.isActive !== undefined) {
      const v = input.isActive;
      row.isActive = v === true || v === 'true' || v === 1 || v === '1';
    }
    if (input.memo !== undefined) {
      const memo = typeof input.memo === 'string' ? input.memo.trim() : '';
      row.memo = memo ? memo.slice(0, 200) : null;
    }
  }

  /** 같은 자리·같은 방 기간 겹침 막기 */
  private async checkConflicts(row: RankAd) {
    if (row.scope === 'global') row.category = null;
    else if (!row.category)
      throw new BadRequestException('카테고리를 골라 주세요.');
    if (row.startsAt && row.endsAt && row.endsAt <= row.startsAt)
      throw new BadRequestException('종료일이 시작일보다 앞이에요.');
    if (!row.isActive) return;
    const others = await this.repo.find({
      where: { scope: row.scope, isActive: true },
    });
    for (const other of others) {
      if (other.id === row.id) continue;
      if (row.scope === 'category' && other.category !== row.category) continue;
      if (!rangesOverlap(other, row)) continue;
      if (other.slot === row.slot) {
        throw new BadRequestException(
          `${row.slot}위 자리에 그 기간 광고가 이미 있어요. 다른 자리나 기간을 골라 주세요.`,
        );
      }
      if (other.channelId === row.channelId) {
        throw new BadRequestException(
          `이 방은 그 기간에 이미 ${other.slot}위 광고가 있어요.`,
        );
      }
    }
  }

  async create(input: RankAdInput) {
    const row = {
      id: randomUUID(),
      scope: parseRankAdScope(input.scope) ?? undefined,
      category: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      memo: null,
      clicks: 0,
    } as Partial<RankAd>;
    if (!row.scope) throw new BadRequestException('광고 종류를 골라 주세요.');
    if (input.slot === undefined)
      throw new BadRequestException('자리는 1~5위 중에서 골라 주세요.');
    if (input.channelId === undefined)
      throw new BadRequestException('광고할 방을 골라 주세요.');
    await this.applyInput(row, input);
    await this.checkConflicts(row as RankAd);
    await this.repo.insert(row);
    return { id: row.id };
  }

  async update(id: string, input: RankAdInput) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('광고가 없습니다.');
    const next = { ...existing };
    await this.applyInput(next, input);
    await this.checkConflicts(next);
    await this.repo.save(next);
    return { ok: true };
  }

  async remove(id: string) {
    await this.repo.delete({ id });
    return { ok: true };
  }
}
