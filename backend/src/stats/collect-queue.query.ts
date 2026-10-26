import { Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { INVITE_EXPIRED_RECHECK_MS } from './collect-fetch';

/** 큐에서 대상을 뽑을 때 읽는 칸. 소개글·제목 같은 큰 칸은 읽지 않는다 (collectOne 이 id 로 전체 행을 다시 읽는다) */
export const COLLECT_QUEUE_COLUMNS = [
  'id',
  'link',
  'username',
  'linkType',
  'collectStatus',
  'lastCollectedAt',
  'nextCollectAt',
] as const satisfies ReadonlyArray<keyof Channel>;

/** 한 회차에 뽑는 최대 채널 수. 시간 예산이 끝나면 남은 것은 다음 회차에 그대로 대상이다 */
export const COLLECT_QUEUE_LIMIT_DEFAULT = 5000;

export function collectQueueLimit(raw?: string | null): number {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return COLLECT_QUEUE_LIMIT_DEFAULT;
}

/**
 * 지금 수집할 차례인 채널을 뽑는다. light·full 공통.
 * - 대상: 공개(active) 채널 중 next_collect_at 이 NULL 이거나 지금 이전
 * - 병합(merged)은 제외, 만료된 초대 링크는 마지막 확인 뒤 7일 동안 제외
 * - 순서: NULL(새로 들어왔거나 아직 한 번도 일정이 없는 채널) 먼저, 그다음 예정 시각이 빠른 순.
 *   NULL 끼리·같은 시각은 마지막 수집이 오래된(없는) 순. NULL 정렬 위치가 DB 마다 달라 CASE 로 고정한다.
 * - light: 채널(그룹 제외)이고 초대 링크가 아닌 것만. 공개 username 확인은 호출한 쪽이 마저 한다.
 */
export async function selectDueChannels(
  repository: Repository<Channel>,
  options: { now?: Date; limit?: number; light?: boolean } = {},
): Promise<Channel[]> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? COLLECT_QUEUE_LIMIT_DEFAULT;
  const inviteCutoff = new Date(now.getTime() - INVITE_EXPIRED_RECHECK_MS);

  const qb = repository
    .createQueryBuilder('c')
    .select(COLLECT_QUEUE_COLUMNS.map((column) => `c.${column}`))
    .where('c.status = :active', { active: ChannelStatus.ACTIVE })
    .andWhere('(c.collectStatus IS NULL OR c.collectStatus <> :merged)', {
      merged: 'merged',
    })
    .andWhere(
      '(c.collectStatus IS NULL OR c.collectStatus <> :inviteExpired OR c.lastCollectedAt IS NULL OR c.lastCollectedAt <= :inviteCutoff)',
      { inviteExpired: 'invite_expired', inviteCutoff },
    )
    .andWhere('(c.nextCollectAt IS NULL OR c.nextCollectAt <= :now)', { now });

  if (options.light) {
    qb.andWhere('c.linkType = :channelType', { channelType: LinkType.CHANNEL })
      .andWhere('c.link NOT LIKE :invitePlus', { invitePlus: '%/+%' })
      .andWhere('c.link NOT LIKE :inviteJoinchat', {
        inviteJoinchat: '%/joinchat/%',
      });
  }

  return qb
    .orderBy('(CASE WHEN c.nextCollectAt IS NULL THEN 0 ELSE 1 END)', 'ASC')
    .addOrderBy('c.nextCollectAt', 'ASC')
    .addOrderBy(
      '(CASE WHEN c.lastCollectedAt IS NULL THEN 0 ELSE 1 END)',
      'ASC',
    )
    .addOrderBy('c.lastCollectedAt', 'ASC')
    .addOrderBy('c.id', 'ASC')
    .limit(limit)
    .getMany();
}
