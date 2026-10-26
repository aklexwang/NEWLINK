import {
  composeAdSlots,
  parseRankAdSlot,
  rangesOverlap,
} from './rank-ad.logic';

const d = (s: string) => new Date(`${s}T00:00:00+09:00`);

describe('rank-ad.logic', () => {
  it('자리 번호는 1~5만', () => {
    expect(parseRankAdSlot('3')).toBe(3);
    expect(parseRankAdSlot(0)).toBeNull();
    expect(parseRankAdSlot(6)).toBeNull();
  });

  it('기간 겹침: 끝 날짜와 다음 시작이 맞닿으면 안 겹침', () => {
    expect(
      rangesOverlap(
        { startsAt: d('2026-11-01'), endsAt: d('2026-11-10') },
        { startsAt: d('2026-11-10'), endsAt: null },
      ),
    ).toBe(false);
    expect(
      rangesOverlap(
        { startsAt: null, endsAt: null },
        { startsAt: d('2026-11-10'), endsAt: d('2026-11-11') },
      ),
    ).toBe(true);
  });

  it('전체 광고가 먼저, 카테고리 광고는 다음 빈 자리로', () => {
    const slots = composeAdSlots(
      [{ id: 'g1', channelId: 'A', scope: 'global', slot: 1 }],
      [
        { id: 'c1', channelId: 'B', scope: 'category', slot: 1 },
        { id: 'c2', channelId: 'A', scope: 'category', slot: 3 },
      ],
    );
    expect(slots.get(1)?.id).toBe('g1');
    expect(slots.get(2)?.id).toBe('c1');
    expect(slots.has(3)).toBe(false); // 같은 방 A 는 한 번만
  });

  it('5위까지 다 차면 더 넣지 않음', () => {
    const globalAds = [1, 2, 3, 4, 5].map((slot) => ({
      id: `g${slot}`,
      channelId: `G${slot}`,
      scope: 'global' as const,
      slot,
    }));
    const slots = composeAdSlots(globalAds, [
      { id: 'c', channelId: 'C', scope: 'category', slot: 2 },
    ]);
    expect(slots.size).toBe(5);
    expect([...slots.values()].some((ad) => ad.id === 'c')).toBe(false);
  });
});
