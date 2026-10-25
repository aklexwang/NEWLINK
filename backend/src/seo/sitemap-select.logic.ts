/**
 * 사이트맵에 넣을 채널 고르기. 회원 화면과 같은 노출 규칙(describeMemberPageVisibility)만 쓴다.
 * 성인·분류대기·외국어·사라짐·합쳐짐·불법 의심 채널은 들어가지 않는다.
 */
import type { DuplicateCandidate } from '../channels/channel-link.logic';
import {
  selectMemberVisibleRows,
  type MemberVisibleInput,
} from '../stats/member-visible.logic';

export type SitemapRow = MemberVisibleInput &
  DuplicateCandidate & {
    username?: string | null;
    lastCollectedAt?: Date | null;
    updatedAt?: Date | null;
  };

export type SitemapEntry = {
  handle: string;
  lastmodSource: Date | null;
};

function handleOf(row: { username?: string | null }): string {
  return (row.username ?? '').replace(/^@/, '').trim().toLowerCase();
}

/** username 이 있는 노출 가능 채널을 링크당 1개, username 오름차순으로 돌려준다 */
export function selectSitemapEntries(rows: SitemapRow[]): SitemapEntry[] {
  const withHandle = rows.filter((row) => handleOf(row) !== '');
  const visible = selectMemberVisibleRows(withHandle);
  const byHandle = new Map<string, SitemapEntry>();
  for (const row of visible) {
    const handle = handleOf(row);
    if (byHandle.has(handle)) continue;
    byHandle.set(handle, {
      handle,
      lastmodSource: row.lastCollectedAt ?? row.updatedAt ?? null,
    });
  }
  return [...byHandle.values()].sort((a, b) =>
    a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0,
  );
}
