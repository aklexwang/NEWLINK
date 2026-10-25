/** 제목 고정 판정. 수집·미리보기·자동 등록이 제목을 덮어쓰기 전에 같은 함수로 확인한다. */
export interface TitleLockable {
  title: string;
  titleLocked?: boolean | null;
}

/** 제목 고정이 켜져 있으면 true */
export function isTitleLocked(channel: { titleLocked?: boolean | null }) {
  return channel.titleLocked === true;
}

/**
 * 수집한 제목을 반영한다. 고정이면 아무것도 바꾸지 않는다.
 * 반환값: 제목이 실제로 바뀌었는지(이벤트 기록 여부 판단용)
 */
export function applyCollectedTitle(
  channel: TitleLockable,
  nextTitle: string | null | undefined,
): boolean {
  if (isTitleLocked(channel)) return false;
  const next = nextTitle?.trim();
  if (!next || next === channel.title) return false;
  channel.title = next;
  return true;
}
