/// <reference types="node" />
// 실행: node --test src/utils/*.test.ts  (frontend 폴더에서)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GRADE_BANDS,
  GRADE_LABEL,
  SCORE_WEIGHTS,
  formatScore,
  gradeFromScore,
  gradeLabel,
  isProvisionalGrade,
  normalizeGrade,
  provisionalNote,
  weightsText,
} from './grade.ts';

describe('등급 한글 변환', () => {
  it('S→최상 A→우수 B→양호 C→보통 D→낮음', () => {
    assert.equal(gradeLabel('S'), '최상');
    assert.equal(gradeLabel('A'), '우수');
    assert.equal(gradeLabel('B'), '양호');
    assert.equal(gradeLabel('C'), '보통');
    assert.equal(gradeLabel('D'), '낮음');
  });

  it('서버 값(S~D)은 그대로 두고 표시만 바꾼다', () => {
    for (const code of ['S', 'A', 'B', 'C', 'D']) {
      assert.equal(normalizeGrade(code), code);
      assert.doesNotMatch(String(gradeLabel(code)), /^[SABCD]$/);
    }
    assert.deepEqual(Object.keys(GRADE_LABEL), ['S', 'A', 'B', 'C', 'D']);
  });

  it('소문자·공백은 받아 주고, 모르는 값은 null', () => {
    assert.equal(gradeLabel(' s '), '최상');
    assert.equal(gradeLabel('X'), null);
    assert.equal(gradeLabel(''), null);
    assert.equal(gradeLabel(null), null);
    assert.equal(gradeLabel(undefined), null);
  });
});

describe('등급 구간과 점수 기준', () => {
  it('구간 문구', () => {
    assert.deepEqual(
      GRADE_BANDS.map((band) => `${band.label} ${band.range}`),
      ['최상 80점 이상', '우수 65~79점', '양호 50~64점', '보통 35~49점', '낮음 35점 미만'],
    );
  });

  it('경계 점수가 맞는 등급으로 간다', () => {
    const cases: [number, string][] = [
      [100, 'S'],
      [80, 'S'],
      [79, 'A'],
      [65, 'A'],
      [64, 'B'],
      [50, 'B'],
      [49, 'C'],
      [35, 'C'],
      [34, 'D'],
      [0, 'D'],
    ];
    for (const [score, grade] of cases) {
      assert.equal(gradeFromScore(score), grade, `${score}점`);
    }
    assert.equal(gradeFromScore(null), null);
  });

  it('채널·그룹 가중치와 합계 100', () => {
    assert.equal(weightsText('channel'), '규모 30% · 실조회율 30% · 활동량 25% · 성장률 15%');
    assert.equal(weightsText('group'), '규모 45% · 활동량 40% · 성장률 15%');
    for (const kind of ['channel', 'group'] as const) {
      const sum = SCORE_WEIGHTS[kind].reduce((total, item) => total + item.percent, 0);
      assert.equal(sum, 100);
    }
  });

  it('점수는 100점 만점 기준으로 "87점"', () => {
    assert.equal(formatScore(87), '87점');
    assert.equal(formatScore(87.4), '87점');
    assert.equal(formatScore(null), null);
  });
});

describe('수집 7일 미만 임시 등급', () => {
  it('7일 미만이면 "수집 n일째 · 임시 등급"', () => {
    assert.equal(provisionalNote(1), '수집 1일째 · 임시 등급');
    assert.equal(provisionalNote(3), '수집 3일째 · 임시 등급');
    assert.equal(provisionalNote(6), '수집 6일째 · 임시 등급');
    assert.equal(provisionalNote(0), '수집 1일째 · 임시 등급');
  });

  it('7일 이상이거나 모르면 문구가 없다', () => {
    assert.equal(provisionalNote(7), null);
    assert.equal(provisionalNote(30), null);
    assert.equal(provisionalNote(null), null);
    assert.equal(provisionalNote(undefined), null);
    assert.equal(isProvisionalGrade(6), true);
    assert.equal(isProvisionalGrade(7), false);
    assert.equal(isProvisionalGrade(null), false);
  });
});
