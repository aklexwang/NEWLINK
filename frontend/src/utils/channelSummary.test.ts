/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataReliability, extractContacts, formatKoDate, formatSince } from './channelSummary.ts';

describe('extractContacts', () => {
  it('이름과 아이디를 뽑는다', () => {
    assert.deepEqual(
      extractContacts('최신주소, 우회 주소, 차단 접속 안됨 해결 방법 안내 고객센터 @newtoki24', 'newtoki_ch'),
      [{ label: '고객센터', handle: 'newtoki24' }],
    );
  });
  it('자기 아이디·이메일·중복은 뺀다', () => {
    assert.deepEqual(
      extractContacts('문의: @Admin_1 메일 a@test.com @newtoki_ch @admin_1', 'newtoki_ch'),
      [{ label: '문의', handle: 'Admin_1' }],
    );
  });
  it('이름이 없으면 label null', () => {
    assert.deepEqual(extractContacts('🔥 @helpdesk', null), [{ label: null, handle: 'helpdesk' }]);
  });
});

describe('날짜·신뢰도', () => {
  it('개설일', () => {
    assert.equal(formatKoDate('2026-04-27T16:00:00Z'), '2026년 04월 28일');
    assert.equal(formatKoDate(null), null);
  });
  it('처음 관측', () => {
    const now = Date.parse('2026-10-26T00:00:00Z');
    assert.equal(formatSince('2026-05-20T00:00:00Z', now), '2026년 5월 · 약 5개월');
    assert.equal(formatSince('2026-10-20T00:00:00Z', now), '2026년 10월 · 6일');
  });
  it('신뢰도', () => {
    assert.equal(dataReliability(3), '부족 (수집 3일째)');
    assert.equal(dataReliability(10), '보통');
    assert.equal(dataReliability(40), '충분');
    assert.equal(dataReliability(null), '집계 전');
  });
});
