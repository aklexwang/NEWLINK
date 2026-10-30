import { checkServerConfig } from './config-health.logic';

describe('서버 설정 점검', () => {
  const base = {
    STATS_CRON_ENABLED: 'true',
    MTPROTO_ENABLED: 'true',
    AI_API_KEY: 'x',
  };

  it('정상 설정이면 경고 없음', () => {
    expect(
      checkServerConfig({
        env: base,
        mtprotoDailyLimit: 1500,
        mtprotoReserve: 285,
      }),
    ).toEqual([]);
  });

  it('자동 수집 꺼짐·MTProto 한도 500 이면 오류 2개', () => {
    const w = checkServerConfig({
      env: { ...base, STATS_CRON_ENABLED: 'false' },
      mtprotoDailyLimit: 500,
      mtprotoReserve: 285,
    });
    expect(w.map((x) => x.level)).toEqual(['error', 'error']);
    expect(w[0].text).toContain('STATS_CRON_ENABLED');
    expect(w[1].text).toContain('MTPROTO_DAILY_LIMIT');
  });
});
