/**
 * 제목·소개만 본다. 짧은 은어(떨·아이스·케이)는 오탐이 커서 결합형만 쓴다.
 * 소개글의 "마약"은 "마약 금지·추방" 같은 운영 규칙 문구가 대부분이라
 * 금지·추방 문맥이면 불법 의심으로 보지 않는다.
 */
const STRONG_DRUG_WORDS = [
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

const GENERIC_DRUG_WORD = '마약';

/** SQL LIKE 용. 제목은 전부, 소개는 STRONG 만 (마약은 문맥 판별이 필요해 JS 에서만) */
export const ILLEGAL_TITLE_LIKE_NEEDLES = [
  GENERIC_DRUG_WORD,
  ...STRONG_DRUG_WORDS,
];
export const ILLEGAL_DESCRIPTION_LIKE_NEEDLES = [...STRONG_DRUG_WORDS];

/** "마약" 주변에 이런 말이 있으면 규칙·금지 문구로 본다 */
const PROHIBIT_CONTEXT_RE =
  /금지|불가|제외|제재|추방|강퇴|퇴장|퇴출|차단|제한|빼고|금함|일절|절대|즉시|강제|칼밴|음란|야동|야짤|사기꾼|성매매|19금|성착취|성인물|먹튀|패드립|위조|박사|아동/;

export const ILLEGAL_HIDE_REASON = '불법 의심(관리자 확인)';

function containsStrongDrugWord(text: string): boolean {
  const lower = text.toLowerCase();
  return STRONG_DRUG_WORDS.some((word) => lower.includes(word));
}

function hasNonRuleGenericMention(description: string): boolean {
  let from = 0;
  while (from < description.length) {
    const index = description.indexOf(GENERIC_DRUG_WORD, from);
    if (index < 0) return false;
    const around = description.slice(
      Math.max(0, index - 14),
      index + GENERIC_DRUG_WORD.length + 22,
    );
    if (!PROHIBIT_CONTEXT_RE.test(around)) return true;
    from = index + GENERIC_DRUG_WORD.length;
  }
  return false;
}

export function hasIllegalDrugSuspicion(
  title?: string | null,
  description?: string | null,
): boolean {
  const titleText = title ?? '';
  const descText = description ?? '';
  if (titleText.includes(GENERIC_DRUG_WORD)) return true;
  if (containsStrongDrugWord(titleText)) return true;
  if (containsStrongDrugWord(descText)) return true;
  return hasNonRuleGenericMention(descText);
}

export function shouldHideIllegalSuspicion(channel: {
  title?: string | null;
  description?: string | null;
  illegalCleared?: boolean | null;
}): boolean {
  if (channel.illegalCleared) return false;
  return hasIllegalDrugSuspicion(channel.title, channel.description);
}

/**
 * 대시보드 집계용 근사. 소개글의 "마약" 단독 언급은 문맥 판별이 필요해 빠진다.
 * 어드민 목록 필터는 JS(hasIllegalDrugSuspicion)로 정확히 거른다.
 */
export function illegalSuspicionSql(
  alias: string,
  bool: { t: string; f: string },
): string {
  const quote = (word: string) => word.replace(/'/g, "''");
  const titleParts = ILLEGAL_TITLE_LIKE_NEEDLES.map(
    (word) => `${alias}.title LIKE '%${quote(word)}%'`,
  );
  const descParts = ILLEGAL_DESCRIPTION_LIKE_NEEDLES.map(
    (word) => `${alias}.description LIKE '%${quote(word)}%'`,
  );
  return `COALESCE(${alias}.illegal_cleared, ${bool.f}) = ${bool.f} AND (${[...titleParts, ...descParts].join(' OR ')})`;
}
