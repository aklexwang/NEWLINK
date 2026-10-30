/** 회원 활동 기록·성향 판정 규칙 (DB 없이 테스트 가능한 부분) */

export const MEMBER_ACTIVITY_RETENTION_DAYS = 90;
/** 같은 회원이 같은 일을 이 시간 안에 반복하면 한 번만 적는다 */
export const MEMBER_ACTIVITY_DEDUPE_MS = 10 * 60 * 1000;

/** 성향 계산에서 행동별 무게 (텔레그램으로 실제 이동이 가장 강한 관심) */
export const ACTIVITY_WEIGHT: Record<string, number> = {
  open: 3,
  favorite: 4,
  view: 1,
  category: 1,
};

export function normalizeKeyword(
  raw: string | null | undefined,
): string | null {
  const v = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return v ? v : null;
}

export type ActivityRow = {
  kind: string;
  channelId: string | null;
  keyword: string | null;
  category: string | null;
  createdAt: Date;
};

export type ChannelInfo = {
  id: string;
  title: string;
  category: string;
  link: string;
  linkType: string;
};

export type MemberProfile = {
  total: number;
  firstAt: string | null;
  lastAt: string | null;
  categories: Array<{ name: string; share: number; score: number }>;
  keywords: Array<{ keyword: string; count: number }>;
  topRooms: Array<{
    channelId: string;
    title: string;
    category: string;
    opens: number;
    views: number;
  }>;
  hours: number[];
  privateShare: number;
  labels: string[];
  summary: string;
};

/** KST 시각(0~23) */
export function kstHour(date: Date): number {
  return (date.getUTCHours() + 9) % 24;
}

const SENSITIVE = new Set([
  '성인',
  '카지노',
  '대출',
  '박제방',
  '계정매입',
  '계정거래',
]);

/** 활동 기록 → 성향 요약 (규칙 기반) */
export function buildMemberProfile(
  rows: ActivityRow[],
  channels: Map<string, ChannelInfo>,
): MemberProfile {
  const catScore = new Map<string, number>();
  const kw = new Map<string, number>();
  const rooms = new Map<string, { opens: number; views: number }>();
  const hours = new Array<number>(24).fill(0);
  let privateHits = 0;
  let roomHits = 0;
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;

  for (const row of rows) {
    const at = new Date(row.createdAt);
    if (!firstAt || at < firstAt) firstAt = at;
    if (!lastAt || at > lastAt) lastAt = at;
    hours[kstHour(at)] += 1;

    if (row.kind === 'search' && row.keyword) {
      const k = row.keyword.toLowerCase();
      kw.set(k, (kw.get(k) ?? 0) + 1);
      continue;
    }
    const weight = ACTIVITY_WEIGHT[row.kind] ?? 0;
    let category = row.category;
    if (row.channelId) {
      const ch = channels.get(row.channelId);
      if (ch) {
        category = category ?? ch.category;
        const r = rooms.get(ch.id) ?? { opens: 0, views: 0 };
        if (row.kind === 'open' || row.kind === 'favorite') r.opens += 1;
        else r.views += 1;
        rooms.set(ch.id, r);
        roomHits += 1;
        if (/\/\+|joinchat\//.test(ch.link)) privateHits += 1;
      }
    }
    if (category && category !== '분류대기' && weight > 0) {
      catScore.set(category, (catScore.get(category) ?? 0) + weight);
    }
  }

  const scoreTotal = [...catScore.values()].reduce((a, b) => a + b, 0);
  const categories = [...catScore.entries()]
    .map(([name, score]) => ({
      name,
      score,
      share: scoreTotal > 0 ? Math.round((score / scoreTotal) * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const keywords = [...kw.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const topRooms = [...rooms.entries()]
    .map(([channelId, r]) => {
      const ch = channels.get(channelId);
      return {
        channelId,
        title: ch?.title ?? '(삭제된 방)',
        category: ch?.category ?? '',
        opens: r.opens,
        views: r.views,
      };
    })
    .sort((a, b) => b.opens * 3 + b.views - (a.opens * 3 + a.views))
    .slice(0, 10);
  const privateShare =
    roomHits > 0 ? Math.round((privateHits / roomHits) * 100) : 0;

  const labels: string[] = [];
  const top = categories[0];
  if (top && top.share >= 50) labels.push(`${top.name} 집중형`);
  else if (categories.length >= 4 && (top?.share ?? 0) < 35)
    labels.push('여러 분야 탐색형');
  else if (top) labels.push(`${top.name} 관심`);
  const night = hours.slice(0, 5).reduce((a, b) => a + b, 0) + hours[23];
  const all = hours.reduce((a, b) => a + b, 0);
  if (all >= 5 && night / all >= 0.4) labels.push('심야 활동 많음');
  if (privateShare >= 40) labels.push('비공개방 선호');
  const sensitive = categories.filter(
    (c) => SENSITIVE.has(c.name) && c.share >= 20,
  );
  for (const c of sensitive) labels.push(`${c.name} 관심 높음`);
  const searches = keywords.reduce((a, b) => a + b.count, 0);
  if (searches >= 10 && searches > roomHits) labels.push('검색 위주');
  if (rows.length < 5) labels.push('데이터 적음');

  const summary =
    rows.length === 0
      ? '아직 기록된 활동이 없어요.'
      : [
          top
            ? `주 관심 ${categories
                .slice(0, 3)
                .map((c) => `${c.name} ${c.share}%`)
                .join(' · ')}`
            : '카테고리 관심 기록 없음',
          keywords.length
            ? `자주 검색: ${keywords
                .slice(0, 3)
                .map((k) => k.keyword)
                .join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' / ');

  return {
    total: rows.length,
    firstAt: firstAt ? firstAt.toISOString() : null,
    lastAt: lastAt ? lastAt.toISOString() : null,
    categories,
    keywords,
    topRooms,
    hours,
    privateShare,
    labels,
    summary,
  };
}
