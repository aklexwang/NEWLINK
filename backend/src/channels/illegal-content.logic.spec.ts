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
      hasIllegalDrugSuspicion('삼국지 홍보', '삼국지 자유홍보 마약/야동 즉시추방'),
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
