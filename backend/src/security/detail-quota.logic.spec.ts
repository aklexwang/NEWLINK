import {
  DailyDetailCounter,
  detailDailyLimit,
  isChannelDetailPath,
  kstDay,
} from './detail-quota.logic';

describe('채널 상세 하루 조회 상한', () => {
  it('기본 100, 환경 변수로 바꿈', () => {
    expect(detailDailyLimit(undefined)).toBe(100);
    expect(detailDailyLimit('150')).toBe(150);
    expect(detailDailyLimit('0')).toBe(100);
    expect(detailDailyLimit('abc')).toBe(100);
  });

  it('상세 요청 경로만 센다', () => {
    expect(isChannelDetailPath('/api/channels/by-username/abc/detail')).toBe(
      true,
    );
    expect(
      isChannelDetailPath(
        '/api/channels/ed3769d5-3d1e-48d0-9ac9-3b8407280a3b/detail?x=1',
      ),
    ).toBe(true);
    expect(
      isChannelDetailPath('/api/channels/by-username/abc/detail/extra'),
    ).toBe(false);
    expect(
      isChannelDetailPath(
        '/api/channels/ed3769d5-3d1e-48d0-9ac9-3b8407280a3b/stats',
      ),
    ).toBe(false);
    expect(isChannelDetailPath('/api/stats/feed')).toBe(false);
  });

  it('한국 날짜가 바뀌면 다시 0부터', () => {
    let t = Date.parse('2026-11-02T14:59:00Z'); // KST 11/2 23:59
    const c = new DailyDetailCounter(() => t);
    expect(c.hit(1)).toBe(1);
    expect(c.hit(1)).toBe(2);
    expect(c.hit(2)).toBe(1);
    t = Date.parse('2026-11-02T15:01:00Z'); // KST 11/3 00:01
    expect(c.hit(1)).toBe(1);
    expect(kstDay(t)).toBe('2026-11-03');
  });
});
