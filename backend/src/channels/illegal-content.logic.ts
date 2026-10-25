/** 제목·소개만. 짧은 은어(떨·아이스·케이)는 오탐이 커서 결합형만. */
const DRUG_PATTERNS: RegExp[] = [
  /마약/,
  /대마초/,
  /필로폰/,
  /히로뽕/,
  /엑스터시/,
  /케타민/,
  /작대기/,
  /떨팝/,
  /떨액/,
  /떨판매/,
  /아이스메트/,
  /액상대마/,
  /해시시/,
  /코카인/,
  /마리화나/,
  /\bcocaine\b/i,
  /\bcannabis\b/i,
  /\bketamine\b/i,
  /\bmeth\b/i,
];

export const ILLEGAL_DRUG_LIKE_NEEDLES = [
  '마약',
  '대마초',
  '필로폰',
  '히로뽕',
  '엑스터시',
  '케타민',
  '작대기',
  '떨팝',
  '떨액',
  '떨판매',
  '아이스메트',
  '액상대마',
  '해시시',
  '코카인',
  '마리화나',
  'cocaine',
  'cannabis',
  'ketamine',
];

export const ILLEGAL_HIDE_REASON = '불법 의심(관리자 확인)';

export function hasIllegalDrugSuspicion(
  title?: string | null,
  description?: string | null,
): boolean {
  const text = `${title ?? ''}\n${description ?? ''}`;
  if (!text.trim()) return false;
  return DRUG_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function shouldHideIllegalSuspicion(channel: {
  title?: string | null;
  description?: string | null;
  illegalCleared?: boolean | null;
}): boolean {
  if (channel.illegalCleared) return false;
  return hasIllegalDrugSuspicion(channel.title, channel.description);
}

export function illegalSuspicionSql(
  alias: string,
  bool: { t: string; f: string },
): string {
  const needles = ILLEGAL_DRUG_LIKE_NEEDLES.map((word) => {
    const escaped = word.replace(/'/g, "''");
    return `${alias}.title LIKE '%${escaped}%' OR ${alias}.description LIKE '%${escaped}%'`;
  }).join(' OR ');
  return `COALESCE(${alias}.illegal_cleared, ${bool.f}) = ${bool.f} AND (${needles})`;
}
