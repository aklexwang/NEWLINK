/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import {
  deltaTone,
  formatDeltaLine,
  formatGrowthLine,
  formatMemberNumber,
  formatMembers,
  formatNumber,
  formatSignedMembers,
  resolveMemberDelta,
  memberDeltaFromGrowth,
  normalizeMemberWording,
} from './memberDisplay.ts';

describe('숫자 포맷', () => {
  it('정확한 숫자에 천 단위 쉼표를 붙인다', () => {
    assert.equal(formatNumber(0), '0');
    assert.equal(formatNumber(999), '999');
    assert.equal(formatNumber(1000), '1,000');
    assert.equal(formatNumber(2500), '2,500');
    assert.equal(formatNumber(1234567), '1,234,567');
    assert.equal(formatNumber(2499.6), '2,500');
    assert.equal(formatNumber(-1234), '-1,234');
  });

  it('값이 없으면 빈 문자열', () => {
    assert.equal(formatNumber(null), '');
    assert.equal(formatNumber(undefined), '');
    assert.equal(formatNumber(Number.NaN), '');
  });

  it('회원 수는 "회원 2,500명" 으로, 채널·그룹 구분이 없다', () => {
    assert.equal(formatMembers(2500), '회원 2,500명');
    assert.equal(formatMemberNumber(2500), '2,500명');
    assert.equal(formatMembers(0), '회원 0명');
    assert.equal(formatMembers(1_500_000), '회원 1,500,000명');
  });

  it('K·M 축약과 "구독" 글자가 나오지 않는다', () => {
    for (const value of [999, 1000, 2500, 12_345, 2_500_000]) {
      const text = formatMembers(value);
      assert.doesNotMatch(text, /[KM]/);
      assert.doesNotMatch(text, /구독/);
    }
  });

  it('회원 수를 모르면 "회원 수 미집계"', () => {
    assert.equal(formatMembers(null), '회원 수 미집계');
    assert.equal(formatMemberNumber(undefined), null);
  });

  it('서버 문구의 "구독자" 를 "회원 수" 로 바꾼다', () => {
    assert.equal(normalizeMemberWording('채널·그룹 · 구독자 순'), '채널·그룹 · 회원 수 순');
    assert.equal(normalizeMemberWording('조회율 순'), '조회율 순');
  });
});

describe('증감 표시', () => {
  it('늘면 +, 줄면 −(유니코드 마이너스), 0 이면 변화 없음', () => {
    assert.equal(formatDeltaLine('7일', 120), '7일 +120명');
    assert.equal(formatDeltaLine('7일', -30), '7일 \u221230명');
    assert.equal(formatDeltaLine('7일', 0), '7일 변화 없음');
    assert.equal(formatSignedMembers(1234), '+1,234명');
    assert.equal(formatSignedMembers(-1234), '\u22121,234명');
  });

  it('24시간·30일도 같은 규칙', () => {
    assert.equal(formatDeltaLine('24시간', 5), '24시간 +5명');
    assert.equal(formatDeltaLine('24시간', -2), '24시간 \u22122명');
    assert.equal(formatDeltaLine('30일', 0), '30일 변화 없음');
    assert.equal(formatDeltaLine('30일', 4500), '30일 +4,500명');
  });

  it('값이 없으면 null 이라 화면에서 표시를 숨긴다', () => {
    assert.equal(formatDeltaLine('7일', null), null);
    assert.equal(formatDeltaLine('7일', undefined), null);
    assert.equal(formatSignedMembers(Number.NaN), null);
  });

  it('증가율에서 회원 증감 수를 되돌린다', () => {
    // 기준일 2,380 → 현재 2,500 : +120
    assert.equal(memberDeltaFromGrowth(2500, (2500 - 2380) / 2380), 120);
    // 기준일 2,530 → 현재 2,500 : −30
    assert.equal(memberDeltaFromGrowth(2500, (2500 - 2530) / 2530), -30);
    assert.equal(memberDeltaFromGrowth(2500, 0), 0);
  });

  it('서버가 real(32비트)로 저장한 증가율도 정수로 맞아떨어진다', () => {
    for (const [now, base] of [
      [2500, 2380],
      [987_654, 981_000],
      [1_250_000, 1_262_345],
      [48_210, 48_000],
    ]) {
      const growth = Math.fround((now - base) / base);
      assert.equal(memberDeltaFromGrowth(now, growth), now - base);
    }
  });

  it('증가율이 없거나 계산할 수 없으면 null (수집 7일 미만)', () => {
    assert.equal(memberDeltaFromGrowth(2500, null), null);
    assert.equal(memberDeltaFromGrowth(2500, undefined), null);
    assert.equal(memberDeltaFromGrowth(null, 0.1), null);
    assert.equal(memberDeltaFromGrowth(2500, -1), null);
    assert.equal(memberDeltaFromGrowth(2500, Number.NaN), null);
    assert.equal(formatGrowthLine('7일', 2500, null), null);
    assert.equal(formatGrowthLine('7일', null, 0.05), null);
  });

  it('증가율로 바로 "7일 +120명" 문구를 만든다', () => {
    assert.equal(formatGrowthLine('7일', 2500, 120 / 2380), '7일 +120명');
    assert.equal(formatGrowthLine('7일', 2500, 0), '7일 변화 없음');
    assert.equal(formatGrowthLine('30일', 2500, -30 / 2530), '30일 \u221230명');
  });

  it('색 구분용 방향', () => {
    assert.equal(deltaTone(120), 'up');
    assert.equal(deltaTone(-1), 'down');
    assert.equal(deltaTone(0), 'flat');
    assert.equal(deltaTone(null), 'flat');
  });
});

test('resolveMemberDelta: 서버 정확한 값 우선, 없으면 증가율 계산', () => {
  assert.equal(resolveMemberDelta(123, 1000, 0.5), 123);
  assert.equal(resolveMemberDelta(null, 1100, 0.1), 100);
  assert.equal(resolveMemberDelta(undefined, null, null), null);
  assert.equal(resolveMemberDelta(-30, 970, null), -30);
});
