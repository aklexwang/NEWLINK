/**
 * 회원 검색용 동의어 그룹.
 * 한 그룹 안의 어떤 단어로 검색해도 같은 그룹 전체가 OR 매칭됩니다.
 */
const SYNONYM_GROUPS: string[][] = [
  // 암호화폐
  [
    '암호화폐',
    '코인',
    '가상화폐',
    '가상자산',
    '크립토',
    'crypto',
    'cryptocurrency',
    'bitcoin',
    '비트코인',
    '이더리움',
    'ethereum',
    '빗썸',
    '업비트',
    '바이낸스',
    'binance',
    '거래소',
  ],
  // 뉴스
  ['뉴스', '시사', '속보', '신문', '뉴스채널', 'news'],
  // 경제
  ['경제', '금융', '주식', '투자', '재테크', '증시', '환율', '펀드'],
  // 쇼핑
  ['쇼핑', '핫딜', '할인', '쇼핑정보', '공동구매', '공구', 'deal'],
  // 교육
  ['교육', '강의', '공부', '학습', '스터디', '학원'],
  // 기술
  ['기술', '테크', '개발', '프로그래밍', '코딩', 'it', 'tech'],
  // 엔터테인먼트
  ['엔터테인먼트', '예능', '연예', '방송', '드라마', '영화', 'entertainment'],
  // 음악
  ['음악', '노래', '뮤직', 'music', '플레이리스트'],
  // 게임
  ['게임', '게이밍', 'e스포츠', '이스포츠', 'game', 'gaming'],
  // 스포츠
  ['스포츠', '축구', '야구', '농구', 'sport', 'sports'],
  // 커뮤니티
  ['커뮤니티', '소통', '모임', '단톡', '오픈채팅', 'community'],
  // 여행
  ['여행', '관광', '해외여행', '여행정보', 'travel'],
  // 맛집
  ['맛집', '음식', '식당', '먹방', '맛집추천', 'food'],
  // 건강
  ['건강', '운동', '헬스', '다이어트', '피트니스', 'health'],
  // 부동산
  ['부동산', '아파트', '전세', '매매', '분양', 'realestate'],
  // 구인구직
  ['구인구직', '채용', '취업', '알바', '구인', '구직', 'job', 'jobs'],
];

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

/** 검색어를 동의어까지 포함한 고유 키워드 목록으로 확장 */
export function expandSearchKeywords(query: string): string[] {
  const raw = normalizeTerm(query);
  if (!raw) return [];

  const expanded = new Set<string>([raw]);

  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map(normalizeTerm);
    if (normalizedGroup.some((term) => raw === term || raw.includes(term) || term.includes(raw))) {
      for (const term of normalizedGroup) {
        if (term) expanded.add(term);
      }
    }
  }

  return [...expanded];
}
