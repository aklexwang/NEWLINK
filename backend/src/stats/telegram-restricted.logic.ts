/**
 * 텔레그램이 약관 위반 등으로 막은 방인지. 앱(안드로이드·iOS)이나 전체에 걸린 제한만 본다.
 * (예: "텔레그램 약관 위반으로 인하여 이 채널을 표시 할 수 없습니다")
 */
export function isTelegramRestricted(
  chat:
    | {
        restricted?: boolean;
        restrictionReason?: Array<{ platform?: string; reason?: string }>;
      }
    | null
    | undefined,
): boolean {
  if (!chat?.restricted) return false;
  const reasons = chat.restrictionReason ?? [];
  if (reasons.length === 0) return true;
  return reasons.some((r) => {
    const p = (r.platform ?? '').toLowerCase();
    return p === 'all' || p === 'android' || p === 'ios';
  });
}
