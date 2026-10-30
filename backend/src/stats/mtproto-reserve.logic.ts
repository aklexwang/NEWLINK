/**
 * MTProto 하루 요청 중 "꼭 해야 하는 작은 일" 몫을 남겨 둔다.
 * 예전에는 수집이 하루 한도를 다 써서 키워드 검색·초대 링크 확인·가입·발견이 매번 막혔다(2026-10-30).
 * 수집(채널 정보·글 읽기)은 한도 - 예비분 까지만 쓰고, 예비분은 아래 일들만 쓴다.
 */
export function mtprotoSpecialReserve(input: {
  inviteCheckDaily: number;
  joinDaily: number;
  keywordSearchDaily: number;
  resolveDaily: number;
}): number {
  return (
    // 초대 링크 확인 1 + (가입한 경우) 채널 정보·글 2
    input.inviteCheckDaily * 3 +
    // 가입 1 + 채널 정보·글 2
    input.joinDaily * 3 +
    input.keywordSearchDaily +
    // 발견: 아이디 조회 1 + 채널 정보 1
    input.resolveDaily * 2 +
    20
  );
}

/** 수집이 MTProto 를 더 써도 되는지 (예비분은 남긴다) */
export function canSpendForCollect(
  remaining: number,
  reserve: number,
): boolean {
  return remaining > reserve;
}

/** 한도가 예비분보다 이만큼은 커야 수집에도 여유가 있다 */
export const MTPROTO_COLLECT_MIN_SHARE = 500;
