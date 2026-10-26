import { addKstDays, formatKstYmd } from '../stats/channel-metrics.math';
import { summarizeMemberVisibility } from '../stats/member-page-count.logic';
import { classifyRegisterSource } from './admin-list.logic';

export type DashboardChannelRow = {
  link?: string;
  recommendCount?: number | null;
  memberCount?: number | null;
  avatarApproved?: boolean | null;
  updatedAt?: Date | string | null;
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
  const collectStatus: Record<string, number> = {};
  const language = { ko: 0, foreign: 0, unknown: 0 };
  const categoryMap = new Map<string, number>();
  let channelCount = 0;
  let groupCount = 0;
  let pendingCount = 0;
  // 노출·숨김·이유별 개수는 회원 화면과 같은 판별 함수 한 곳에서만 센다
  const member = summarizeMemberVisibility(channels);

  for (const channel of channels) {
    if (channel.linkType === 'group') groupCount += 1;
    else channelCount += 1;
    if (channel.status === 'pending') pendingCount += 1;

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
    memberVisible: member.visible,
    memberHidden: member.hidden,
    memberDuplicateExcess: member.duplicateExcess,
    memberListTotal: member.listTotal,
    hiddenReasons: member.hiddenReasons,
    registered: { today, last7d },
    pendingCount,
    collectStatus,
    language,
    categories,
  };
}

function time(value: Date | string): number {
  const at =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : 0;
}

export function sqlBoolLiterals(driver: string): { t: string; f: string } {
  if (driver === 'postgres' || driver === 'postgresql') {
    return { t: 'TRUE', f: 'FALSE' };
  }
  return { t: '1', f: '0' };
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
