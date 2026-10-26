/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RankAdSlot } from '../api/ranking';
import type { RankingChannel } from '../types/ranking';
import { mergeRankAds } from './mergeRankAds.ts';

const ch = (id: string) => ({ id, title: id }) as RankingChannel;

describe('mergeRankAds', () => {
  it('광고 자리에 끼우고, 광고 방은 원래 자리에서 빠진다', () => {
    const organic = ['a', 'b', 'c', 'd'].map(ch);
    const ads: RankAdSlot[] = [
      { adId: 'x', slot: 1, scope: 'global', channel: ch('c') },
      { adId: 'y', slot: 3, scope: 'category', channel: ch('z') },
    ];
    const rows = mergeRankAds(organic, ads);
    assert.deepEqual(rows.map((r) => r.channel.id), ['c', 'a', 'z', 'b', 'd']);
    assert.deepEqual(rows.map((r) => r.rank), [null, 1, null, 2, 4]);
  });

  it('광고 없으면 그대로', () => {
    assert.deepEqual(mergeRankAds([ch('a')], []).map((r) => r.rank), [1]);
  });
});
