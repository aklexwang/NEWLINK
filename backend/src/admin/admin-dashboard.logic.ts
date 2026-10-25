import { illegalSuspicionSql } from '../channels/illegal-content.logic';
import { addKstDays, formatKstYmd } from '../stats/channel-metrics.math';
import { describeMemberPageVisibility } from '../stats/public-list-visibility.logic';
import { classifyRegisterSource } from './admin-list.logic';

export type DashboardChannelRow = {
  linkType?: string | null;
  status?: string | null;
  isVisible?: boolean | null;
  firstObservedAt?: Date | string | null;
  collectStatus?: string | null;
  collectError?: string | null;
  language?: string | null;
  isPromoted?: boolean | null | undefined;
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  illegalCleared?: boolean | null;
  createdAt: Date | string;
};

export function kstDayStart(now = new Date()): Date {
  return new Date(`${formatKstYmd(now)}T00:00:00+09:00`);
}

export function kstRollingStart(daysInclusive: number, now = new Date()): Date {
  const startYmd = addKstDays(formatKstYmd(now), -(daysInclusive - 1));
  return new Date(`${startYmd}T00:00:00+09:00`);
}

export function emptySourceCounts() {
  return { auto: 0, admin: 0, report: 0, total: 0 };
}

export function buildAdminDashboard(
  channels: DashboardChannelRow[],
  now = new Date(),
) {
  const todayStart = kstDayStart(now).getTime();
  const weekStart = kstRollingStart(7, now).getTime();
  const today = emptySourceCounts();
  const last7d = emptySourceCounts();
  const hiddenReasons: Record<string, number> = {};
  const collectStatus: Record<string, number> = {};
  const language = { ko: 0, foreign: 0, unknown: 0 };
  const categoryMap = new Map<string, number>();
  let channelCount = 0;
  let groupCount = 0;
  let memberVisible = 0;
  let memberHidden = 0;
  let pendingCount = 0;

  for (const channel of channels) {
    if (channel.linkType === 'group') groupCount += 1;
    else channelCount += 1;
    if (channel.status === 'pending') pendingCount += 1;

    const vis = describeMemberPageVisibility(channel);
    if (vis.visible) memberVisible += 1;
    else {
      memberHidden += 1;
      hiddenReasons[vis.reasonKey] = (hiddenReasons[vis.reasonKey] ?? 0) + 1;
    }

    const collectKey = channel.collectStatus || '(없음)';
    collectStatus[collectKey] = (collectStatus[collectKey] ?? 0) + 1;

    if (channel.language === 'ko') language.ko += 1;
    else if (channel.language === 'foreign') language.foreign += 1;
    else language.unknown += 1;

    const category = (channel.category ?? '').trim() || '(없음)';
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);

    const created = time(channel.createdAt);
    const source = classifyRegisterSource(channel);
    if (created >= weekStart) {
      last7d[source] += 1;
      last7d.total += 1;
    }
    if (created >= todayStart) {
      today[source] += 1;
      today.total += 1;
    }
  }

  const categories = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    channelCount,
    groupCount,
    memberVisible,
    memberHidden,
    hiddenReasons,
    registered: { today, last7d },
    pendingCount,
    collectStatus,
    language,
    categories,
  };
}

function time(value: Date | string): number {
  const at = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : 0;
}

export function sqlBoolLiterals(driver: string): { t: string; f: string } {
  if (driver === 'postgres' || driver === 'postgresql') {
    return { t: 'TRUE', f: 'FALSE' };
  }
  return { t: '1', f: '0' };
}

/** describeMemberPageVisibility 와 같은 숨김 이유. alias 는 QueryBuilder 테이블 별칭 */
export function visibilityReasonSql(
  alias: string,
  bool: { t: string; f: string },
): string {
  return `CASE
    WHEN ${alias}.status <> 'active' THEN '승인되지 않음'
    WHEN COALESCE(${alias}.is_visible, ${bool.t}) = ${bool.f} THEN '관리자가 숨김'
    WHEN COALESCE(${alias}.collect_status, '') <> 'invite_only' AND ${alias}.first_observed_at IS NULL THEN '아직 수집되지 않음'
    WHEN ${alias}.collect_status = 'invalid' THEN '채널·그룹 아님'
    WHEN ${alias}.collect_status = 'gone' THEN '사라진 채널'
    WHEN ${alias}.collect_status = 'merged' THEN '합쳐진 채널'
    WHEN ${alias}.collect_status = 'invite_expired' THEN '초대 만료'
    WHEN ${alias}.language = 'foreign' AND COALESCE(${alias}.is_promoted, ${bool.f}) = ${bool.f} THEN '외국어'
    WHEN ${illegalSuspicionSql(alias, bool)} THEN '불법 의심(관리자 확인)'
    WHEN ${alias}.category = '분류대기' THEN '분류대기'
    WHEN ${alias}.category = '성인' THEN '성인 카테고리'
    ELSE ''
  END`;
}

export function registerSourceSql(
  alias: string,
  bool: { t: string; f: string },
): string {
  return `CASE
    WHEN ${alias}.submitted_by IS NOT NULL THEN 'report'
    WHEN COALESCE(${alias}.auto_registered, ${bool.f}) = ${bool.t} THEN 'auto'
    ELSE 'admin'
  END`;
}
