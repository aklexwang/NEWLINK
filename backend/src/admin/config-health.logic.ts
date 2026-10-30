import { MTPROTO_COLLECT_MIN_SHARE } from '../stats/mtproto-reserve.logic';

export type ConfigWarning = { level: 'error' | 'warn'; text: string };

function on(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * 서버 설정(환경 변수) 점검. Render 설정이 코드가 기대하는 값과 달라 생긴 문제
 * (자동 수집 꺼짐, MTProto 한도 너무 낮음 등)를 화면·텔레그램으로 바로 알린다.
 */
export function checkServerConfig(input: {
  env: Record<string, string | undefined>;
  mtprotoDailyLimit: number;
  mtprotoReserve: number;
}): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const { env } = input;
  if (!on(env.STATS_CRON_ENABLED)) {
    out.push({
      level: 'error',
      text: 'STATS_CRON_ENABLED 가 꺼져 있어요 → 서버가 수집을 직접 시작하지 않아 GitHub 예비 실행에만 의존해요(자주 늦거나 빠짐). true 로 바꿔 주세요.',
    });
  }
  if (!on(env.MTPROTO_ENABLED)) {
    out.push({
      level: 'warn',
      text: 'MTPROTO_ENABLED 가 꺼져 있어요 → 비공개 채널 가입·키워드 검색·발견이 돌지 않아요.',
    });
  } else {
    const need = input.mtprotoReserve + MTPROTO_COLLECT_MIN_SHARE;
    if (input.mtprotoDailyLimit < need) {
      out.push({
        level: 'error',
        text: `MTPROTO_DAILY_LIMIT 가 ${input.mtprotoDailyLimit} 로 낮아요 → 수집에 쓸 몫이 거의 없어요. ${Math.ceil(need / 100) * 100} 이상(권장 1500)으로 올려 주세요.`,
      });
    }
  }
  if (!(env.AI_API_KEY ?? '').trim() && !(env.OPENAI_API_KEY ?? '').trim()) {
    out.push({
      level: 'warn',
      text: 'AI 키가 없어요 → 카테고리 AI 분류가 키워드로만 돌아 분류대기가 늘어요.',
    });
  }
  return out;
}
