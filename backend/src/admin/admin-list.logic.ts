import {
  describeAdminMemberVisibility,
  describeMemberPageVisibility,
} from '../stats/public-list-visibility.logic';

export const ADMIN_LIST_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE_SIZE = 200;

export type AdminListSort =
  | 'created_desc'
  | 'members_desc'
  | 'collected_desc'
  | 'title_asc'
  | 'promo_order';

export type AdminRegisterSource = 'auto' | 'admin' | 'report';

export function clampAdminPage(raw: string | number | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function clampAdminPageSize(raw: string | number | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return ADMIN_LIST_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), ADMIN_LIST_MAX_PAGE_SIZE);
}

/** SQLite·Postgres 모두 NULL을 뒤로 보내는 ORDER BY 조각 */
export function nullsLastCaseSql(alias: string, column: string): string {
  return `CASE WHEN ${alias}.${column} IS NULL THEN 1 ELSE 0 END`;
}

export function parseAdminListSort(
  raw: string | null | undefined,
): AdminListSort {
  if (raw === 'members_desc') return 'members_desc';
  if (raw === 'collected_desc') return 'collected_desc';
  if (raw === 'title_asc') return 'title_asc';
  if (raw === 'promo_order') return 'promo_order';
  return 'created_desc';
}

export function classifyRegisterSource(channel: {
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
}): AdminRegisterSource {
  if (channel.submittedBy != null) return 'report';
  if (channel.autoRegistered) return 'auto';
  return 'admin';
}

export function matchesMemberPageFilter(
  channel: Parameters<typeof describeMemberPageVisibility>[0],
  filters: { memberPage?: 'yes' | 'no' | ''; hideReason?: string },
): boolean {
  if (!filters.memberPage && !filters.hideReason) return true;
  const vis = describeAdminMemberVisibility(channel);
  if (filters.memberPage === 'yes' && !vis.visible) return false;
  if (filters.memberPage === 'no' && vis.visible) return false;
  if (filters.hideReason && vis.reasonKey !== filters.hideReason) return false;
  return true;
}

export function sortAdminListItems<
  T extends {
    title: string;
    createdAt: Date | string;
    memberCount?: number | null;
    lastCollectedAt?: Date | string | null;
    promotionSortOrder?: number | null;
  },
>(items: T[], sort: AdminListSort): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === 'promo_order') {
      return (a.promotionSortOrder ?? 0) - (b.promotionSortOrder ?? 0);
    }
    if (sort === 'title_asc') {
      return a.title.localeCompare(b.title, 'ko');
    }
    if (sort === 'members_desc') {
      const aNull = a.memberCount == null ? 1 : 0;
      const bNull = b.memberCount == null ? 1 : 0;
      if (aNull !== bNull) return aNull - bNull;
      return (b.memberCount ?? 0) - (a.memberCount ?? 0);
    }
    if (sort === 'collected_desc') {
      const aNull = a.lastCollectedAt == null ? 1 : 0;
      const bNull = b.lastCollectedAt == null ? 1 : 0;
      if (aNull !== bNull) return aNull - bNull;
      return time(b.lastCollectedAt) - time(a.lastCollectedAt);
    }
    return time(b.createdAt) - time(a.createdAt);
  });
  return copy;
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; page: number; pageSize: number } {
  const total = items.length;
  const safePage = clampAdminPage(page);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
  };
}

function time(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const at =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : 0;
}
