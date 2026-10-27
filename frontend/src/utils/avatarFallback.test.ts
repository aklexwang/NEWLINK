/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { avatarInitials } from './avatarFallback.ts';

describe('avatarInitials', () => {
  it('텔레그램처럼 첫 낱말·마지막 낱말 첫 글자', () => {
    assert.equal(avatarInitials('[삼성/조현렬] 정유/화학 Newsfeed'), '삼N');
    assert.equal(avatarInitials('코인 수다방'), '코수');
    assert.equal(avatarInitials('chart'), 'C');
    assert.equal(avatarInitials('   '), '?');
  });
});
