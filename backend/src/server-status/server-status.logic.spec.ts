import {
  dailyGrowthMb,
  daysUntilFull,
  decodeHistory,
  encodeHistory,
  levelOf,
  percent,
  pushSizePoint,
} from './server-status.logic';

describe('server-status.logic', () => {
  it('퍼센트와 단계', () => {
    expect(percent(176, 1024)).toBe(17.2);
    expect(levelOf(17)).toBe('ok');
    expect(levelOf(80)).toBe('warn');
    expect(levelOf(95)).toBe('danger');
  });

  it('하루 증가량과 꽉 차는 날', () => {
    let h = pushSizePoint([], { d: '2026-10-20', mb: 100 });
    h = pushSizePoint(h, { d: '2026-10-28', mb: 180 });
    h = pushSizePoint(h, { d: '2026-10-28', mb: 180 });
    expect(h).toHaveLength(2);
    expect(dailyGrowthMb(h)).toBe(10);
    expect(daysUntilFull(180, 1024, 10)).toBe(84);
    expect(daysUntilFull(180, 1024, null)).toBeNull();
  });

  it('500자 안에 저장', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      d: `2026-09-${String(i + 1).padStart(2, '0')}`,
      mb: 100 + i,
    }));
    const text = encodeHistory(many);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(decodeHistory(text).length).toBeGreaterThan(5);
    expect(decodeHistory('oops')).toEqual([]);
  });
});
