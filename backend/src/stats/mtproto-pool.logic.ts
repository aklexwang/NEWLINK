/**
 * 수집 계정 풀(멀티 계정) 순수 로직. C#1.
 *
 * 왜: FloodWait(요청 과다 시 텔레그램이 거는 대기)는 계정별로 따로 걸린다. 한 계정만 쓰면
 * 그 계정이 막히는 동안 MTProto 수집이 통째로 멈춘다(예: 03:25 에 2849초). 계정을 여러 개 두고
 * 번갈아 쓰면, 한 계정이 막혀도 다른 계정으로 계속 읽고 아이디 조회(resolve) 여유도 n배가 된다.
 *
 * 공유 예산(requestsToday·resolvesToday·searchesToday)은 그대로 전체 합계로 둔다(안전·예의용 상한).
 * 계정마다 다른 것은 FloodWait 상태와 연결(client)뿐이다.
 *
 * 세션 문자열은 사용자가 Render 환경변수로 넣는다. 전화번호·로그인은 여기서 다루지 않는다.
 */

/** env 에서 세션 문자열 목록을 뽑는다.
 * 우선순위: TELEGRAM_SESSION → TELEGRAM_SESSION_2..N → TELEGRAM_SESSIONS(줄바꿈/콤마 구분).
 * 공백 제거·중복 제거. 순서는 넣은 순서를 유지(첫 번째가 기존 단일 계정과 같은 자리).
 */
export function parseSessionList(
  env: Record<string, string | null | undefined>,
): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const v = (raw ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  push(env.TELEGRAM_SESSION);
  // TELEGRAM_SESSION_2, _3, ... 연속으로 있는 만큼
  for (let i = 2; i <= 50; i += 1) {
    const key = `TELEGRAM_SESSION_${i}`;
    if (env[key] == null || String(env[key]).trim() === '') continue;
    push(env[key]);
  }
  // TELEGRAM_SESSIONS: 한 변수에 여러 개를 줄바꿈/콤마/세미콜론으로
  const bulk = (env.TELEGRAM_SESSIONS ?? '').trim();
  if (bulk) {
    for (const part of bulk.split(/[\n,;]+/)) push(part);
  }
  return out;
}

/** 계정 index(0-based) → mtproto_state 행 id. 첫 계정은 기존 행(id=1)을 그대로 쓴다. */
export function accountStateId(index: number): number {
  return index + 1;
}

export interface PoolAccountFlood {
  /** FloodWait 해제 시각. null 이면 안 막힘 */
  floodWaitUntil: Date | null;
  /** 인증 오류 등으로 이 계정을 영구 중단했는지 */
  authStopped?: boolean;
}

/** 이 계정을 지금 쓸 수 있는가(인증 중단 아님 + FloodWait 안 걸림) */
export function isAccountAvailable(
  account: PoolAccountFlood,
  now: Date = new Date(),
): boolean {
  if (account.authStopped) return false;
  return !isFloodBlocking(account.floodWaitUntil, now);
}

function isFloodBlocking(until: Date | null, now: Date): boolean {
  return until != null && until.getTime() > now.getTime();
}

/**
 * 라운드로빈으로 다음에 쓸 계정 index 를 고른다.
 * pointer 다음 자리부터 한 바퀴 돌며 "쓸 수 있는" 첫 계정을 찾는다. 없으면 null.
 */
export function pickNextAccount(
  accounts: PoolAccountFlood[],
  pointer: number,
  now: Date = new Date(),
): number | null {
  const n = accounts.length;
  if (n === 0) return null;
  for (let step = 0; step < n; step += 1) {
    const idx = (pointer + step) % n;
    if (isAccountAvailable(accounts[idx], now)) return idx;
  }
  return null;
}

/** 모든 계정이 막혔는가(FloodWait 또는 인증 중단). 하나라도 쓸 수 있으면 false */
export function allAccountsBlocked(
  accounts: PoolAccountFlood[],
  now: Date = new Date(),
): boolean {
  if (accounts.length === 0) return true;
  return accounts.every((a) => !isAccountAvailable(a, now));
}

/**
 * 모든 계정 중 가장 이른 FloodWait 해제 시각(쓸 수 있는 계정이 하나도 없을 때 "언제 풀리나"용).
 * 쓸 수 있는 계정이 있으면 null. 전부 인증 중단이면 null.
 */
export function earliestFloodRecovery(
  accounts: PoolAccountFlood[],
  now: Date = new Date(),
): Date | null {
  if (!allAccountsBlocked(accounts, now)) return null;
  let earliest: Date | null = null;
  for (const a of accounts) {
    if (a.authStopped) continue;
    if (a.floodWaitUntil == null) continue;
    if (earliest == null || a.floodWaitUntil.getTime() < earliest.getTime()) {
      earliest = a.floodWaitUntil;
    }
  }
  return earliest;
}
