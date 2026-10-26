/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNewerBuild } from './appVersion.ts';

describe('isNewerBuild', () => {
  it('빌드 번호가 다르면 새 버전', () => {
    assert.equal(isNewerBuild('abc', { build: 'def' }), true);
  });
  it('같거나 응답이 이상하면 아님', () => {
    assert.equal(isNewerBuild('abc', { build: 'abc' }), false);
    assert.equal(isNewerBuild('abc', null), false);
    assert.equal(isNewerBuild('abc', { build: '' }), false);
    assert.equal(isNewerBuild('abc', '<html>'), false);
  });
  it('개발 중(dev)에는 안 띄운다', () => {
    assert.equal(isNewerBuild('dev', { build: 'x' }), false);
  });
});
