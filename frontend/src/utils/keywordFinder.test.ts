/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectTelegramEntries,
  dedupeRows,
  findLinesWithKeywords,
  findValuesByKey,
  parseKeys,
  toTelegramEntry,
} from './keywordFinder.ts';

const json = `{
  "success": true,
  "data": { "channels": [
    { "id": "238536", "username": "holdemlove", "title": "다모아" },
    { "id": "1", "username": "ui_5_7", "count": 12 },
    { "Username": "PREMIUM_JUNCO_JTV" },
    { "username": "513393" },
    { "username": "_c3410440091" },
    { "username": "holdemlove" }
  ]}
}`;

describe('keywordFinder', () => {
  it('키 이름으로 값 찾기 (대소문자 무시)', () => {
    const rows = findValuesByKey(json, ['username'], false);
    assert.deepEqual(
      rows.map((r) => r.value),
      ['holdemlove', 'ui_5_7', 'PREMIUM_JUNCO_JTV', '513393', '_c3410440091', 'holdemlove'],
    );
    assert.equal(rows[0].line, 4);
  });

  it('대소문자 구분', () => {
    assert.equal(findValuesByKey(json, ['username'], true).length, 5);
  });

  it('숫자 값과 여러 키', () => {
    const rows = findValuesByKey(json, parseKeys('count, title'), false);
    assert.deepEqual(
      rows.map((r) => `${r.key}=${r.value}`),
      ['title=다모아', 'count=12'],
    );
  });

  it('key = value 줄', () => {
    assert.equal(findValuesByKey('username = abcde\nfoo: 1', ['username'], false)[0].value, 'abcde');
  });

  it('키워드가 들어간 줄', () => {
    const rows = findLinesWithKeywords(json, ['JUNCO'], false);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].line, 6);
  });

  it('중복 제거', () => {
    assert.equal(dedupeRows(findValuesByKey(json, ['username'], false), false).length, 5);
  });

  it('텔레그램 주소로 바꾸기', () => {
    assert.equal(toTelegramEntry('holdemlove'), 'holdemlove');
    assert.equal(toTelegramEntry('@abc_de'), 'abc_de');
    assert.equal(toTelegramEntry('https://t.me/s/news_kr'), 'news_kr');
    assert.equal(toTelegramEntry('t.me/+AbCdEf123'), 'https://t.me/+AbCdEf123');
    assert.equal(toTelegramEntry('513393'), null);
    assert.equal(toTelegramEntry('_c3410440091'), null);
    assert.equal(toTelegramEntry('abc'), null);
  });

  it('보낼 목록은 아이디만, 중복 없이', () => {
    const rows = findValuesByKey(json, ['username'], false);
    assert.deepEqual(collectTelegramEntries(rows), ['holdemlove', 'ui_5_7', 'PREMIUM_JUNCO_JTV']);
  });
});
