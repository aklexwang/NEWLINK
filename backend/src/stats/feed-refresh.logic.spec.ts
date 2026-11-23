import { feedMtprotoIntervalMs, isRefreshDue } from './feed-refresh.logic';

const MIN = 60 * 1000;

describe('feedMtprotoIntervalMs', () => {
  it('is 30 minutes for a few rooms', () => {
    expect(feedMtprotoIntervalMs(0)).toBe(30 * MIN);
    expect(feedMtprotoIntervalMs(5)).toBe(30 * MIN);
  });
  it('spreads 400 calls a day across many rooms', () => {
    expect(feedMtprotoIntervalMs(20)).toBe(72 * MIN);
    expect(feedMtprotoIntervalMs(40)).toBe(144 * MIN);
  });
});

describe('isRefreshDue', () => {
  it('is due when never refreshed or the interval passed', () => {
    expect(isRefreshDue(null, 10, 100)).toBe(true);
    expect(isRefreshDue(80, 10, 100)).toBe(true);
    expect(isRefreshDue(95, 10, 100)).toBe(false);
  });
});
