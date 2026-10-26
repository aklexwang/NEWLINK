import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { AdBanner } from './ad-banner.entity';
import {
  daysLeft,
  expiryLabel,
  kstYmd,
  shouldNotifyExpiry,
} from './ad-payment.logic';
import { RankAd } from './rank-ad.entity';

type ExpiringAd = {
  key: string;
  kind: string;
  name: string;
  where: string;
  left: number;
  lastDay: string;
  usdt: number | null;
  link: string;
};

/**
 * 광고 마감 알림: 마지막 노출일 3일 전부터 마지막 날까지 하루 한 번
 * 어드민 종(🔔)과 관리자 텔레그램으로 알린다. (같은 광고·같은 날은 한 번만)
 */
@Injectable()
export class AdExpiryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdExpiryService.name);

  constructor(
    @InjectRepository(AdBanner)
    private readonly bannerRepo: Repository<AdBanner>,
    @InjectRepository(RankAd)
    private readonly rankAdRepo: Repository<RankAd>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    private readonly notifications: AdminNotificationService,
    private readonly telegram: TelegramAdminNotifyService,
  ) {}

  onApplicationBootstrap() {
    // 서버가 켜질 때도 한 번 (오전 알림 시각에 꺼져 있었을 수 있음)
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(
      () => void this.check().catch(() => undefined),
      60_000,
    ).unref?.();
  }

  @Cron('0 10 * * *', { timeZone: 'Asia/Seoul' })
  async handleCron() {
    await this.check();
  }

  async check(now = new Date()): Promise<number> {
    const found = await this.findExpiring(now);
    let sent = 0;
    for (const ad of found) {
      const title = `⏰ 광고 ${expiryLabel(ad.left)}: ${ad.name}`;
      const body = `${ad.kind} · ${ad.where} · ${ad.lastDay}까지${
        ad.usdt != null ? ` · ${ad.usdt} USDT` : ''
      }`;
      const made = await this.notifications.notifyOnce({
        key: ad.key,
        type: 'ad_expiry',
        title,
        body,
        link: ad.link,
      });
      if (!made) continue;
      sent += 1;
      const esc = (v: string) => this.telegram.escapeHtml(v);
      await this.telegram.notifyText(
        [
          `⏰ <b>광고 ${esc(expiryLabel(ad.left))}</b>`,
          '',
          `<b>${esc(ad.name)}</b>`,
          `${esc(ad.kind)} · ${esc(ad.where)}`,
          `마지막 노출일: ${ad.lastDay}`,
          ad.usdt != null ? `받은 광고비: ${ad.usdt} USDT` : '',
          '',
          '연장하려면 관리자 페이지 → 광고 관리에서 종료일을 바꾸세요.',
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n'),
      );
    }
    if (sent) this.logger.log(`광고 마감 알림 ${sent}건`);
    return sent;
  }

  private async findExpiring(now: Date): Promise<ExpiringAd[]> {
    const out: ExpiringAd[] = [];
    const banners = await this.bannerRepo.find({ where: { isActive: true } });
    for (const b of banners) {
      const left = daysLeft(b.endsAt, now);
      if (!b.endsAt || !shouldNotifyExpiry(left)) continue;
      const lastDay = kstYmd(new Date(b.endsAt.getTime() - 1));
      out.push({
        key: `ad-expiry:banner:${b.id}:${lastDay}:${left}`,
        kind: '배너 광고',
        name: b.title,
        where: '회원 홈 배너',
        left: left as number,
        lastDay,
        usdt: b.paidUsdt,
        link: '/admin/ads',
      });
    }
    const rankAds = await this.rankAdRepo.find({ where: { isActive: true } });
    const ids = [...new Set(rankAds.map((a) => a.channelId))];
    const titles = new Map(
      (ids.length
        ? await this.channelRepo.find({
            where: { id: In(ids) },
            select: ['id', 'title'],
          })
        : []
      ).map((c) => [c.id, c.title]),
    );
    for (const a of rankAds) {
      const left = daysLeft(a.endsAt, now);
      if (!a.endsAt || !shouldNotifyExpiry(left)) continue;
      const lastDay = kstYmd(new Date(a.endsAt.getTime() - 1));
      out.push({
        key: `ad-expiry:rank:${a.id}:${lastDay}:${left}`,
        kind: '텔레그램방 광고',
        name: titles.get(a.channelId) ?? '(지워진 방)',
        where:
          a.scope === 'global'
            ? `전체 카테고리 ${a.slot}위`
            : `${a.category ?? ''} ${a.slot}위`,
        left: left as number,
        lastDay,
        usdt: a.paidUsdt,
        link: '/admin/ads?tab=rooms',
      });
    }
    return out;
  }
}
