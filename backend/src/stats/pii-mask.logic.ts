/**
 * 그룹 대화를 저장하기 전에 개인정보를 가린다(원문은 저장하지 않는다).
 *
 * 가리는 것:
 *  - 이메일            abc@naver.com      → ●●●@●●●
 *  - 전화·계좌·주민번호  숫자가 9개 이상 이어진 덩어리(공백·-·.·괄호 허용) → 앞 3자리만 남기고 ●
 *  - @아이디           @someone           → @●●●
 *  - 메신저 아이디      카톡: abc123 / 라인 abc / kakao: abc → 카톡: ●●●
 *
 * 가리지 않는 것: t.me 링크(방 소개가 우리 서비스의 본업), 금액(1,000,000 — 쉼표는 이어진 숫자로 안 봄),
 * 날짜·시각(숫자 8개 이하).
 */

export const MASK = '●●●';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
/** 숫자로 시작·끝, 사이에 공백·하이픈·점·괄호 허용 */
const DIGIT_RUN_RE = /\+?\(?\d[\d\s().-]*\d/g;
const MIN_PII_DIGITS = 9;
const DATE_RE = /\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/g;
/** 한글 라벨은 콜론 없이도, 영어 라벨은 콜론이 있을 때만(일반 영어 문장 보호) */
const MESSENGER_KO_RE =
  /((?:카카오톡|카톡|카카오|라인|위챗|텔레그램|텔레|아이디|문의)\s*(?:아이디|id|ID)?\s*[:：]?\s*)([A-Za-z0-9_.-]{3,32})/g;
const MESSENGER_EN_RE =
  /(\b(?:kakao(?:talk)?|line|wechat|telegram|tg|id)\s*[:：]\s*)([A-Za-z0-9_.-]{3,32})/gi;
/** t.me/… 바로 뒤가 아닌 @아이디 */
const HANDLE_RE = /(^|[^A-Za-z0-9_/.])@([A-Za-z][A-Za-z0-9_]{3,31})/g;

function maskDigitRun(run: string): string {
  const digits = run.replace(/\D/g, '');
  if (digits.length < MIN_PII_DIGITS) return run;
  // 앞 3자리(010, 은행 코드 등)는 남겨 어떤 종류인지만 보이게
  return `${digits.slice(0, 3)}${MASK}`;
}

export function maskPersonalInfo(text: string | null | undefined): string {
  if (!text) return '';
  let out = text.replace(EMAIL_RE, `${MASK}@${MASK}`);
  out = out.replace(MESSENGER_KO_RE, (_m, label: string, id: string) =>
    /^\d+$/.test(id) && id.length < 6 ? `${label}${id}` : `${label}${MASK}`,
  );
  out = out.replace(MESSENGER_EN_RE, (_m, label: string) => `${label}${MASK}`);
  out = out.replace(HANDLE_RE, (_m, lead: string) => `${lead}@${MASK}`);
  // 날짜(2026.11.13 / 2026-11-13)는 뒤 숫자와 붙어 보여도 가리지 않게 잠시 빼 둔다
  const dates: string[] = [];
  out = out.replace(DATE_RE, (d) => {
    dates.push(d);
    return `\u0000${dates.length - 1}\u0000`;
  });
  out = out.replace(DIGIT_RUN_RE, (run) => maskDigitRun(run));
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => dates[Number(i)]);
  return out;
}
