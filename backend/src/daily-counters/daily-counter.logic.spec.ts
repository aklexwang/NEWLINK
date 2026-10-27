import {
  decodeDailyForToday,
  dailyKey,
  encodeDaily,
  safeCount,
} from './daily-counter.logic';

describe('daily-counter.logic', () => {
  it('오늘 날짜면 값을 되살린다', () => {
    const raw = encodeDaily('2026-10-27', { used: 12 });
    expect(decodeDailyForToday<{ used: number }>(raw, '2026-10-27')).toEqual({
      used: 12,
    });
  });

  it('날짜가 다르면 null', () => {
    const raw = encodeDaily('2026-10-26', { used: 12 });
    expect(decodeDailyForToday(raw, '2026-10-27')).toBeNull();
  });

  it('깨진 값·빈 값은 null', () => {
    expect(decodeDailyForToday('{oops', '2026-10-27')).toBeNull();
    expect(decodeDailyForToday(null, '2026-10-27')).toBeNull();
    expect(
      decodeDailyForToday('{"date":"2026-10-27","values":3}', '2026-10-27'),
    ).toBeNull();
  });

  it('키는 64자 안', () => {
    expect(dailyKey('mtproto').length).toBeLessThanOrEqual(64);
  });

  it('safeCount', () => {
    expect(safeCount(3.7)).toBe(3);
    expect(safeCount(-1)).toBe(0);
    expect(safeCount('x')).toBe(0);
  });
});

import { AiDailyBudget } from '../auto-manage/category-ai.logic';
import { TmeGate } from '../stats/tme-gate';

describe('재시작 후 되살리기', () => {
  it('AI 예산: 사용 수와 중단 이유가 이어진다', () => {
    const now = () => new Date('2026-10-27T03:00:00Z');
    const a = new AiDailyBudget(300, now);
    a.tryAcquire();
    a.tryAcquire();
    a.stopToday('402');
    const saved = a.exportState();
    const b = new AiDailyBudget(300, now);
    b.restore(saved.values);
    expect(b.snapshot()).toMatchObject({
      used: 2,
      stopReason: '402',
      stopped: true,
    });
  });

  it('AI 예산: 저장 때 onChange 가 불린다', () => {
    const a = new AiDailyBudget(300);
    const fn = jest.fn();
    a.onChange = fn;
    a.tryAcquire();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('t.me 게이트: 429 수와 잠금이 이어진다', () => {
    const g = new TmeGate();
    g.restoreDaily({ tme429: 7, bot429: 2, locked: true });
    const snap = g.snapshot();
    expect(snap.today.tme429).toBe(7);
    expect(snap.today.bot429).toBe(2);
    expect(snap.lockedToday).toBe(true);
    const fn = jest.fn();
    g.setDailyListener(fn);
    g.noteBot429();
    expect(fn).toHaveBeenCalled();
    expect(g.exportDaily().values.bot429).toBe(3);
  });
});
