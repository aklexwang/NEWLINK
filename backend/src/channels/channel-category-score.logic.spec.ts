import {
  confidenceFromScore,
  scoreKeywordCategory,
  TITLE_SCORE,
} from './channel-category-score.logic';

const allowed = [
  '뉴스',
  '경제',
  '암호화폐',
  '기술',
  '성인',
  '카지노',
  '홍보',
  '반려동물',
  '육아',
  '종교',
  '기타',
];

describe('scoreKeywordCategory', () => {
  it('제목 가중치가 소개·글보다 크다', () => {
    const byTitle = scoreKeywordCategory({
      title: '한국 뉴스 모음',
      description: '',
      posts: [],
      allowedCategories: allowed,
    });
    const byDesc = scoreKeywordCategory({
      title: '모음',
      description: '뉴스 채널입니다',
      posts: [],
      allowedCategories: allowed,
    });
    expect(byTitle.category).toBe('뉴스');
    expect(byTitle.score).toBe(TITLE_SCORE);
    expect(byTitle.confidence).toBeGreaterThanOrEqual(0.7);
    expect(byDesc.score).toBe(2);
    expect(byDesc.confidence).toBeLessThan(0.7);
  });

  it('최근 글 매칭은 최대 5회만 더한다', () => {
    const posts = Array.from({ length: 20 }, () => '오늘 뉴스 속보');
    const scored = scoreKeywordCategory({
      title: '모음',
      description: '',
      posts,
      allowedCategories: allowed,
    });
    expect(scored.category).toBe('뉴스');
    expect(scored.score).toBe(5);
  });

  it('성인은 제목·소개만 보고 글의 야동은 무시한다', () => {
    const fromPost = scoreKeywordCategory({
      title: '일상 공유',
      description: '소소한 이야기',
      posts: ['야동 링크'],
      allowedCategories: allowed,
    });
    expect(fromPost.category).not.toBe('성인');
    expect(fromPost.confidence).toBeLessThan(0.7);

    const fromTitle = scoreKeywordCategory({
      title: '야동 공유방',
      description: '',
      posts: [],
      allowedCategories: allowed,
    });
    expect(fromTitle.category).toBe('성인');
    expect(fromTitle.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('성인이라는 말만으로는 성인 분류가 되지 않는다', () => {
    const scored = scoreKeywordCategory({
      title: '성인 ADHD 정보',
      description: '건강 상담',
      posts: [],
      allowedCategories: allowed,
    });
    expect(scored.category).not.toBe('성인');
  });

  it('글에만 있는 AI 로는 기술이 되지 않는다', () => {
    const scored = scoreKeywordCategory({
      title: '일상 기록',
      description: '오늘 일기',
      posts: ['AI 가 추천한 음악', 'ChatGPT AI 소식'],
      allowedCategories: allowed,
    });
    expect(scored.category).not.toBe('기술');
  });

  it('점수 0 이면 신뢰도가 낮아 분류대기로 간다', () => {
    const scored = scoreKeywordCategory({
      title: '아무 말 대잔치',
      description: '그냥 모음',
      posts: [],
      allowedCategories: allowed,
    });
    expect(scored.confidence).toBe(0.2);
    expect(confidenceFromScore(0)).toBe(0.2);
  });
});
