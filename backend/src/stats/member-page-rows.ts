import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { illegalDescriptionPrefilterSql } from '../channels/illegal-content.logic';
import type { MemberPageRow } from './member-page-count.logic';

type RawRow = Record<string, unknown>;

function toBool(value: unknown): boolean | null {
  if (value == null) return null;
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 't' ||
    value === 'true'
  );
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | string | null {
  if (value == null) return null;
  return value instanceof Date ? value : String(value);
}

/**
 * 회원 노출 판정에 필요한 컬럼만 읽는다 (채널 1.5만 개에서도 가볍게).
 * 소개글은 불법 의심 단어가 들어 있을 때만 가져온다. 판정 결과는 전체를 읽을 때와 같다.
 */
export async function loadMemberPageRows(
  repository: Repository<Channel>,
  options: { onlyActive: boolean },
): Promise<Array<MemberPageRow & { link: string }>> {
  const qb = repository
    .createQueryBuilder('channel')
    .select('channel.link', 'link')
    .addSelect('channel.status', 'status')
    .addSelect('channel.isVisible', 'isVisible')
    .addSelect('channel.firstObservedAt', 'firstObservedAt')
    .addSelect('channel.collectStatus', 'collectStatus')
    .addSelect('channel.language', 'language')
    .addSelect('channel.isPromoted', 'isPromoted')
    .addSelect('channel.autoRegistered', 'autoRegistered')
    .addSelect('channel.submittedBy', 'submittedBy')
    .addSelect('channel.category', 'category')
    .addSelect('channel.title', 'title')
    .addSelect(
      `CASE WHEN ${illegalDescriptionPrefilterSql(
        'channel',
        repository.manager.connection.options.type === 'postgres'
          ? 'postgres'
          : 'sqlite',
      )} THEN channel.description ELSE NULL END`,
      'description',
    )
    .addSelect('channel.illegalCleared', 'illegalCleared')
    .addSelect('channel.recommendCount', 'recommendCount')
    .addSelect('channel.memberCount', 'memberCount')
    .addSelect('channel.avatarApproved', 'avatarApproved')
    .addSelect('channel.updatedAt', 'updatedAt');
  if (options.onlyActive) {
    qb.where('channel.status = :status', { status: ChannelStatus.ACTIVE });
  }
  const raws = await qb.getRawMany<RawRow>();
  return raws.map((raw) => ({
    link: String(raw.link ?? ''),
    status: raw.status == null ? null : String(raw.status),
    isVisible: toBool(raw.isVisible),
    firstObservedAt: toDate(raw.firstObservedAt),
    collectStatus: raw.collectStatus == null ? null : String(raw.collectStatus),
    language: raw.language == null ? null : String(raw.language),
    isPromoted: toBool(raw.isPromoted),
    autoRegistered: toBool(raw.autoRegistered),
    submittedBy: toNum(raw.submittedBy),
    category: raw.category == null ? null : String(raw.category),
    title: raw.title == null ? null : String(raw.title),
    description: raw.description == null ? null : String(raw.description),
    illegalCleared: toBool(raw.illegalCleared),
    recommendCount: toNum(raw.recommendCount),
    memberCount: toNum(raw.memberCount),
    avatarApproved: toBool(raw.avatarApproved),
    updatedAt: toDate(raw.updatedAt),
  }));
}
