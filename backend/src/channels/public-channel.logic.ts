/**
 * 회원·공개 API 로 내보내도 되는 채널 칸만 남긴다(허용 목록).
 * 2026-10-30 점검: 공개 검색·광고 목록이 채널 행 전체를 돌려줘서
 * 제보자 텔레그램 ID·보상 지갑·광고주 정보·수집 메모 등이 그대로 보였다.
 * 새 칸을 엔티티에 추가해도 여기 넣기 전에는 밖으로 나가지 않는다.
 */
export const PUBLIC_CHANNEL_FIELDS = [
  'id',
  'title',
  'link',
  'linkType',
  'category',
  'description',
  'recommendCount',
  'status',
  'isPromoted',
  'promotedUntil',
  'promotionSortOrder',
  'adClient',
  'avatarUrl',
  'avatarApproved',
  'isVerified',
  'score',
  'grade',
  'viewRate',
  'createdAt',
  'username',
  'language',
  'memberCount',
  'createdOn',
  'telegramChatId',
  'posts7d',
  'observedDays',
  'growth24h',
  'growth7d',
  'growth30d',
  'memberDelta24h',
  'memberDelta7d',
  'memberDelta30d',
  'medianViews7d',
  'lastCollectedAt',
  'firstObservedAt',
] as const;

export function toPublicChannel<T extends object>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  const src = row as Record<string, unknown>;
  for (const key of PUBLIC_CHANNEL_FIELDS) {
    if (key in src) out[key] = src[key];
  }
  return out as Partial<T>;
}

export function toPublicChannels<T extends object>(rows: T[]): Partial<T>[] {
  return rows.map((row) => toPublicChannel(row));
}
