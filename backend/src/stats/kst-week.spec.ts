import {
  currentIsoWeek,
  isoWeekFromYmd,
  isoWeekRangeKst,
  parseIsoWeek,
  previousIsoWeek,
} from './kst-week';

describe('ISO 주차', () => {
  it('YYYY-Www 형식을 읽는다', () => {
    expect(parseIsoWeek('2026-W42')).toEqual({ year: 2026, week: 42 });
    expect(parseIsoWeek('bad')).toBeNull();
  });

  it('2026-10-19(월)은 2026-W43이다', () => {
    expect(isoWeekFromYmd('2026-10-19')).toEqual({ year: 2026, week: 43 });
    expect(isoWeekRangeKst(2026, 43)).toEqual({
      startYmd: '2026-10-19',
      endYmd: '2026-10-25',
    });
  });

  it('지난주는 7일 전의 주차이다', () => {
    expect(previousIsoWeek('2026-10-19').label).toBe('2026-W42');
  });

  it('이번 주는 해당 날짜의 주차이다', () => {
    expect(currentIsoWeek('2026-10-22').label).toBe('2026-W43');
    expect(isoWeekRangeKst(2026, 43).startYmd).toBe('2026-10-19');
  });

  it('금요일·일요일도 같은 ISO 주다', () => {
    expect(isoWeekFromYmd('2026-10-23')).toEqual({ year: 2026, week: 43 });
    expect(isoWeekFromYmd('2026-10-25')).toEqual({ year: 2026, week: 43 });
    expect(isoWeekFromYmd('2026-10-26')).toEqual({ year: 2026, week: 44 });
  });
});
