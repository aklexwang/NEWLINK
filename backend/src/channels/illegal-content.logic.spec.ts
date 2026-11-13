import { DataSource } from 'typeorm';
import {
  hasIllegalDrugSuspicion,
  ILLEGAL_HIDE_REASON,
  illegalDescriptionPrefilterSql,
  shouldHideIllegalSuspicion,
} from './illegal-content.logic';

describe('illegal-content.logic', () => {
  it('마약·필로폰·작대기는 잡고 아이스크림·케이팝은 지나간다', () => {
    expect(hasIllegalDrugSuspicion('필로폰 거래', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('작대기 문의', '작대기 팝니다')).toBe(true);
    expect(hasIllegalDrugSuspicion('마약 정보방', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('아이스크림 맛집', '서울 카페')).toBe(false);
    expect(hasIllegalDrugSuspicion('케이팝 차트', '아이돌 소식')).toBe(false);
    expect(hasIllegalDrugSuspicion('손이 떨려요', '건강 상담')).toBe(false);
  });

  it('소개글의 마약 금지·추방 규칙 문구는 오탐으로 보지 않는다', () => {
    expect(
      hasIllegalDrugSuspicion(
        '자유홍보방',
        '홍보 횟수제한 없음 마약, 음란물, 사기꾼 차단',
      ),
    ).toBe(false);
    expect(
      hasIllegalDrugSuspicion('홍보랜드', '사기. 마약. 19금 절대 금!!'),
    ).toBe(false);
    expect(
      hasIllegalDrugSuspicion(
        '삼국지 홍보',
        '삼국지 자유홍보 마약/야동 즉시추방',
      ),
    ).toBe(false);
    expect(
      hasIllegalDrugSuspicion('백과사전', '🖥️ 모든 종류의 마약 정보 🖥️'),
    ).toBe(true);
  });

  it('마약 뒤에 음식 단어가 붙은 제목은 오탐으로 보지 않는다', () => {
    for (const title of [
      '마약김밥 맛집',
      '마약떡볶이',
      '마약옥수수 판매',
      '🍞 마약토스트',
      '마약계란 레시피',
      '마약소스 모음',
    ]) {
      expect(hasIllegalDrugSuspicion(title, '')).toBe(false);
    }
    expect(hasIllegalDrugSuspicion('', '마약김밥 맛집 후기')).toBe(false);
  });

  it('음식 표현이 아닌 마약이 하나라도 있으면 여전히 잡는다', () => {
    expect(hasIllegalDrugSuspicion('마약류 거래', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('마약김밥 마약 판매', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('마약 정보', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('마약', '')).toBe(true);
  });

  it('소개글의 강한 약물 단어는 문맥과 상관없이 잡는다', () => {
    expect(hasIllegalDrugSuspicion('정보방', '필로폰 후기 공유')).toBe(true);
  });

  it('문제없음이면 숨기지 않는다', () => {
    expect(
      shouldHideIllegalSuspicion({
        title: '마약 관련',
        description: '',
        illegalCleared: false,
      }),
    ).toBe(true);
    expect(
      shouldHideIllegalSuspicion({
        title: '마약 관련',
        description: '',
        illegalCleared: true,
      }),
    ).toBe(false);
    expect(ILLEGAL_HIDE_REASON).toBe('불법 의심(관리자 확인)');
  });

  it('소개글 사전 조건(SQL)은 JS 가 불법 의심으로 보는 소개글을 놓치지 않는다', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    try {
      const descriptions = [
        '모든 종류의 마약 정보',
        '마약, 음란물 금지',
        '마약김밥 맛집 후기',
        '필로폰 후기 공유',
        'Cocaine shop',
        'CANNABIS 판매',
        '서울 카페 소개',
        '',
      ];
      for (const description of descriptions) {
        const rows: Array<{ hit: number }> = await dataSource.query(
          `SELECT CASE WHEN ${illegalDescriptionPrefilterSql('c')} THEN 1 ELSE 0 END AS hit
           FROM (SELECT ? AS description) c`,
          [description],
        );
        const hit = Number(rows[0].hit) === 1;
        if (hasIllegalDrugSuspicion('', description)) {
          expect(hit).toBe(true);
        }
      }
      const plain: Array<{ hit: number }> = await dataSource.query(
        `SELECT CASE WHEN ${illegalDescriptionPrefilterSql('c')} THEN 1 ELSE 0 END AS hit
         FROM (SELECT ? AS description) c`,
        ['서울 카페 소개'],
      );
      expect(Number(plain[0].hit)).toBe(0);
    } finally {
      await dataSource.destroy();
    }
  });
});

describe('불법 의심 소개글 SQL (Postgres)', () => {
  it('한글은 정규식 하나, 영문은 대소문자 무시 정규식 하나로 만든다', () => {
    const sql = illegalDescriptionPrefilterSql('c', 'postgres');
    expect(sql).toContain("c.description ~ '(마약|");
    expect(sql).toContain("c.description ~* '(cocaine|cannabis|ketamine)'");
    expect(sql).not.toContain('LIKE');
  });
});

describe('금지 표시(마약X 등)는 불법 의심 아님 — 2026-11-13 숨김 10개 확인분', () => {
  const no = (title: string, desc: string) =>
    expect(hasIllegalDrugSuspicion(title, desc)).toBe(false);
  const yes = (title: string, desc: string) =>
    expect(hasIllegalDrugSuspicion(title, desc)).toBe(true);
  it('소개글 규칙', () => {
    no('🎬CGV', '<CGV 소통그룹입니다>\n\n편하게 소통/홍보/링공 하시면됩니다.\n\n도배X\n마약X\n고어X\n사기X');
    no('올인구조대 자유홍보방', '자유로운 홍보\n마약x 성인x 성업하세요');
    no('야놀자 낚시터', '야한소통/자유링공(개인 및 소통방)/업자홍보는 따로문의\n(마약X,아청X,딥페X)');
    no('제왕 - 본방', '*마약, 사기, 사칭, 포르노 등 규칙위반시 즉시 벤');
    no('구인구직 홍보방', '소통방,채널,마약,통장홍보는 밴사유이니 주의해주세요');
  });
  it('제목 금지 표시', () => {
    no('BOX NO.1홍보(마약.성X)', 'NO.1 communication room');
    no('PINNACLE (피나클홍보/마약,성X)', 'gaming communication room');
  });
  it('진짜 의심은 그대로', () => {
    yes('大 KOREAYB 공지채널', '아이스팝니다 떨팝니다 아이스1g 떨사는곳 대마초 허브 케타민');
    yes('[ ⌦ DRUG 백과사전 ]', '🖥️ 모든 종류의 마약 정보 🖥️');
    yes('마약 판매', '');
    yes('채널', '마약 삽니다 문의');
  });
});
