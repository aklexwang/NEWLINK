/**
 * 입장 요청 후보를 "같은 방 추정"끼리 묶는다.
 *
 * 왜: 한 채널이 초대 링크를 여러 개 뿌려서(유입 경로 추적용) 같은 방이 링크만 달리 여러 번 등록된다
 * (예: 四神 8개, 악인 8개). 같은 방인지 확실히 아는 텔레그램 내부 ID 는 수집 계정이 회원이 된 뒤에야
 * 보이므로, 요청 전에는 이름 + 회원 수로 추정한다.
 *
 * 규칙: 이름이 같고(공백·대소문자 무시) 회원 수 차이가 묶음 최댓값의 3%(최소 50명) 이내면 같은 방.
 *  - 링크마다 수집 시점이 달라 숫자가 조금씩 다르다(21,258 / 21,255 / 21,254).
 *  - 이미 요청함/승인된 방과 같은 묶음이면 그 묶음 전체를 후보에서 뺀다(같은 방에 두 번 요청 방지).
 */

export interface CandidateRow {
  id: string;
  title: string;
  link: string;
  category: string | null;
  memberCount: number | null;
}

export interface TakenRow {
  title: string;
  memberCount: number | null;
}

export interface CandidateGroup extends CandidateRow {
  /** 묶인 링크 수(1이면 묶인 것 없음) */
  linkCount: number;
  /** 묶음의 모든 링크(대표 포함, 회원 수 많은 순) */
  links: Array<{ id: string; link: string; memberCount: number | null }>;
}

export const SAME_ROOM_TOLERANCE_RATIO = 0.03;
export const SAME_ROOM_TOLERANCE_MIN = 50;

export function normalizeRoomTitle(title: string): string {
  return title.replace(/\s+/g, '').toLowerCase();
}

function tolerance(base: number): number {
  return Math.max(SAME_ROOM_TOLERANCE_MIN, Math.floor(base * SAME_ROOM_TOLERANCE_RATIO));
}

function sameRoom(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  const hi = Math.max(a, b);
  return hi - Math.min(a, b) <= tolerance(hi);
}

export function groupSameRoomCandidates(
  candidates: CandidateRow[],
  taken: TakenRow[],
  limit: number,
): CandidateGroup[] {
  const byTitle = new Map<string, CandidateRow[]>();
  for (const row of candidates) {
    const key = normalizeRoomTitle(row.title);
    const list = byTitle.get(key);
    if (list) list.push(row);
    else byTitle.set(key, [row]);
  }
  const takenByTitle = new Map<string, Array<number | null>>();
  for (const row of taken) {
    const key = normalizeRoomTitle(row.title);
    const list = takenByTitle.get(key);
    if (list) list.push(row.memberCount);
    else takenByTitle.set(key, [row.memberCount]);
  }

  const groups: CandidateGroup[] = [];
  for (const [key, rows] of byTitle) {
    const sorted = [...rows].sort(
      (a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1),
    );
    let current: CandidateRow[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const rep = current[0];
      const takenCounts = takenByTitle.get(key) ?? [];
      // 같은 방이 이미 요청함/승인 상태면 묶음 전체를 뺀다
      const already = takenCounts.some((m) =>
        current.some((r) => sameRoom(r.memberCount, m)),
      );
      if (!already) {
        groups.push({
          ...rep,
          linkCount: current.length,
          links: current.map((r) => ({
            id: r.id,
            link: r.link,
            memberCount: r.memberCount,
          })),
        });
      }
      current = [];
    };
    for (const row of sorted) {
      if (current.length > 0 && !sameRoom(current[0].memberCount, row.memberCount)) {
        flush();
      }
      current.push(row);
    }
    flush();
  }

  groups.sort((a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1));
  return groups.slice(0, limit);
}
