/**
 * 홍보 문구 만들기(순수 함수). AI 가 없거나 실패해도 기본 문구가 나오게 한다.
 * 같은 글 반복은 스팸으로 보이므로 여러 버전을 만들어 돌려 쓴다.
 */

export const PROMO_DEFAULT_LINK = 'https://t.me/telllink_bot';
export const PROMO_TEXT_MAX = 700;

export type PromoCopyInput = {
  /** 회원 화면에 보이는 방 수 */
  rooms: number;
  /** 카테고리 수 */
  categories: number;
  link: string;
};


/** 기본 문구 여러 버전(AI 없이). 방 개수·카테고리 개수는 알리지 않는다(운영 방침) */
export function buildTemplateCopies(input: PromoCopyInput): string[] {
  const link = input.link;
  return [
    `📡 텔레그램 채널·그룹, 아직도 하나하나 찾으세요?\n\nTellLink 에서 텔레그램 방을 카테고리별로 한 번에!\n✅ 회원 수·활동량 순위\n✅ 급상승 방 · 주간 변화\n✅ 무료\n\n👉 ${link}`,
    `🔎 텔레그램 방 검색은 TellLink\n\n• 한국 채널·그룹 한곳에 모음\n• 카테고리별로 골라 보기\n• 진짜 활발한 방만 골라 보기\n\n지금 열어보기 👉 ${link}`,
    `요즘 뜨는 텔레그램 방이 궁금하다면 🔥\nTellLink 랭킹에서 이번 주 급상승 방을 확인하세요.\n\n무료 · 가입 없이 바로 👉 ${link}`,
    `📢 내 채널·그룹도 무료 등록!\nTellLink 에 링크만 제보하면 텔레그램 방을 찾는 사람들에게 노출돼요.\n\n방 찾기 / 방 등록 👉 ${link}`,
    `텔레그램 디렉터리 TellLink ✨\n\n채널·그룹 검색 | 카테고리별 모음 | 매일 업데이트\n검색 한 번이면 끝 👉 ${link}`,
    `🗂 카테고리별 텔레그램 방 모음\n코인 · 주식 · 뉴스 · 커뮤니티 · 쇼핑 …\n\nTellLink 에서 한눈에 보기 👉 ${link}`,
  ];
}

/** AI 에게 줄 지시문 */
export function aiCopyPrompt(
  input: PromoCopyInput,
  count: number,
): {
  system: string;
  user: string;
} {
  return {
    system:
      '너는 텔레그램 홍보방에 올릴 짧은 한국어 홍보 글을 쓰는 카피라이터다. 과장·거짓·자극적인 표현, 성인·도박 표현을 쓰지 않는다. 방 개수·카테고리 개수 같은 숫자는 절대 쓰지 않는다. 글마다 문장과 구성을 다르게 한다. 이모지는 2~4개만. 각 글은 300자 이내. 글과 글 사이는 한 줄에 --- 만 써서 구분한다. 다른 설명은 쓰지 않는다.',
    user: `서비스: TellLink (텔레그램 채널·그룹 찾기 디렉터리, 무료)\n특징: 한국 텔레그램 채널·그룹 모음, 카테고리별 보기, 회원 수·활동량 랭킹, 급상승 방, 주간 변화, 내 방 무료 등록(제보)\n링크: ${input.link} (글 끝에 꼭 넣기)\n홍보 글 ${count}개를 써줘.`,
  };
}

/** AI 답을 글 목록으로(링크 없으면 붙이고, 너무 길면 자름) */
export function parseAiCopies(
  raw: string | null | undefined,
  link: string,
): string[] {
  if (!raw) return [];
  return raw
    .split(/\n\s*-{3,}\s*\n|^\s*-{3,}\s*$/m)
    .map((t) =>
      t
        .replace(/^\s*(\d+[.)]|글\s*\d+[:.)]?)\s*/u, '')
        .replace(/\*\*/g, '')
        .trim(),
    )
    .filter((t) => t.length >= 20)
    .map((t) => (t.includes(link) ? t : `${t}\n\n👉 ${link}`))
    .map((t) =>
      t.length > PROMO_TEXT_MAX ? `${t.slice(0, PROMO_TEXT_MAX - 1)}…` : t,
    )
    .slice(0, 10);
}
