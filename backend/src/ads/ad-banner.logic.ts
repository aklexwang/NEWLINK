/** 배너 권장 크기·제한 */
export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 400;
export const BANNER_MAX_BYTES = 1024 * 1024;
export const BANNER_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 넘김 간격(초) 고를 수 있는 값 */
export const BANNER_ROTATE_CHOICES = [1, 2, 3, 5, 7, 10] as const;
export const BANNER_ROTATE_DEFAULT = 3;
export const BANNER_ROTATE_KEY = 'banner_rotate_seconds';

export function parseRotateSeconds(raw: unknown): number {
  const n = Number(raw);
  return (BANNER_ROTATE_CHOICES as readonly number[]).includes(n)
    ? n
    : BANNER_ROTATE_DEFAULT;
}

/** 지금 보여 줄 배너인지: 켜져 있고, 시작일 이후, 종료일 이전 */
export function isBannerLive(
  banner: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): boolean {
  if (!banner.isActive) return false;
  const t = now.getTime();
  if (banner.startsAt && banner.startsAt.getTime() > t) return false;
  if (banner.endsAt && banner.endsAt.getTime() <= t) return false;
  return true;
}

/** 텔레그램 링크만 허용(t.me / telegram.me), https 로 맞춘다 */
export function normalizeBannerLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  if (text.startsWith('@')) text = `https://t.me/${text.slice(1)}`;
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (!['t.me', 'telegram.me', 'telegram.dog', 'www.t.me'].includes(host))
      return null;
    if (url.pathname.length <= 1) return null;
    return `https://t.me${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** 이미지 파일 앞부분으로 실제 종류 확인(확장자 위조 방지) */
export function sniffImageMime(
  data: Buffer,
): (typeof BANNER_MIMES)[number] | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'image/jpeg';
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** "2026-11-30" → 그날 KST 시작(00:00) / 끝(다음날 00:00). 빈 값 → null */
export function kstDateBoundary(raw: unknown, end: boolean): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()))
    return null;
  const base = new Date(`${raw.trim()}T00:00:00+09:00`);
  if (!Number.isFinite(base.getTime())) return null;
  return end ? new Date(base.getTime() + 86_400_000) : base;
}

/** 배너 자리: 홈 / 카테고리 메인 / 카테고리별 */
export const BANNER_PLACEMENT_HOME = 'home';
export const BANNER_PLACEMENT_CATEGORY_MAIN = 'category:all';

export function normalizeBannerPlacement(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '')
    return BANNER_PLACEMENT_HOME;
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v === BANNER_PLACEMENT_HOME) return v;
  const m = /^category:(.{1,48})$/.exec(v);
  return m ? `category:${m[1].trim()}` : null;
}

/**
 * 카테고리 화면에 보일 배너 고르기.
 * 그 카테고리 광고 → 없으면 카테고리 메인 광고. (홈 광고는 3:1 이라 얇은 카테고리 자리에 맞지 않아 쓰지 않음)
 */
export function pickCategoryBanners<T extends { placement: string }>(
  live: T[],
  category: string | null | undefined,
): T[] {
  const cat = (category ?? '').trim();
  if (cat && cat !== 'all') {
    const own = live.filter((b) => b.placement === `category:${cat}`);
    if (own.length > 0) return own;
  }
  // 홈 광고(3:1)는 얇은 카테고리 자리에 맞지 않아 쓰지 않는다
  return live.filter((b) => b.placement === BANNER_PLACEMENT_CATEGORY_MAIN);
}
