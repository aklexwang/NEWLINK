import {
  STALE_INVITE_RECHECK_DAILY_MAX,
  shouldRecheckStaleInvite,
} from './stale-invite.logic';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 23);
const base = {
  isChannel: true,
  latestPostAtMs: now - 4 * DAY,
  lastRecheckAtMs: null,
  rechecksToday: 0,
  invitesToday: 0,
  inviteDailyLimit: 120,
  nowMs: now,
};

describe('shouldRecheckStaleInvite', () => {
  it('rechecks a channel whose last post is older than 3 days', () => {
    expect(shouldRecheckStaleInvite(base)).toBe(true);
  });
  it('skips fresh channels', () => {
    expect(
      shouldRecheckStaleInvite({ ...base, latestPostAtMs: now - DAY }),
    ).toBe(false);
  });
  it('skips groups', () => {
    expect(shouldRecheckStaleInvite({ ...base, isChannel: false })).toBe(false);
  });
  it('respects the daily cap and the invite limit', () => {
    expect(
      shouldRecheckStaleInvite({
        ...base,
        rechecksToday: STALE_INVITE_RECHECK_DAILY_MAX,
      }),
    ).toBe(false);
    expect(shouldRecheckStaleInvite({ ...base, invitesToday: 120 })).toBe(
      false,
    );
  });
  it('waits 3 days before rechecking the same room again', () => {
    expect(
      shouldRecheckStaleInvite({ ...base, lastRecheckAtMs: now - DAY }),
    ).toBe(false);
    expect(
      shouldRecheckStaleInvite({ ...base, lastRecheckAtMs: now - 4 * DAY }),
    ).toBe(true);
  });
  it('rechecks when no post was ever stored', () => {
    expect(shouldRecheckStaleInvite({ ...base, latestPostAtMs: null })).toBe(
      true,
    );
  });
});
