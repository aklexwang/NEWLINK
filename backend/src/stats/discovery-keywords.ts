import { randomUUID } from 'crypto';

/**
 * 키워드 검색 발견용 상수.
 * 카테고리 이름 23개(기본 20 + 증권·해킹·웹툰)와 각 3~5개의 대표 한국어 검색어입니다.
 * 검색은 가입하지 않고 contacts.Search 만 씁니다.
 */

export type DiscoveryKeywordGroup = {
  category: string;
  keywords: string[];
};

export const DISCOVERY_KEYWORD_GROUPS: DiscoveryKeywordGroup[] = [
  {
    category: '분류대기',
    keywords: ['정보방', '공유방', '모음', '오픈채팅'],
  },
  {
    category: '뉴스',
    keywords: ['속보', '신문', '시사', '보도'],
  },
  {
    category: '경제',
    keywords: ['주식', '투자', '재테크', '환율'],
  },
  {
    category: '암호화폐',
    keywords: ['코인', '비트코인', '업비트', '알트코인'],
  },
  {
    category: '쇼핑',
    keywords: ['핫딜', '쿠팡', '공구', '할인'],
  },
  {
    category: '교육',
    keywords: ['공부', '강의', '입시', '자격증'],
  },
  {
    category: '기술',
    keywords: ['개발', '코딩', '프로그래밍', '인공지능'],
  },
  {
    category: '엔터테인먼트',
    keywords: ['연예', '드라마', '영화', '예능'],
  },
  {
    category: '음악',
    keywords: ['케이팝', '플레이리스트', '노래', '아이돌'],
  },
  {
    category: '게임',
    keywords: ['롤', '피파', '스팀', '모바일게임'],
  },
  {
    category: '스포츠',
    keywords: ['축구', '야구', '농구', '스포츠중계'],
  },
  {
    category: '커뮤니티',
    keywords: ['잡담', '익명', '수다', '모임'],
  },
  {
    category: '여행',
    keywords: ['해외여행', '항공권', '제주', '호텔'],
  },
  {
    category: '맛집',
    keywords: ['맛집추천', '카페', '배달', '한식'],
  },
  {
    category: '건강',
    keywords: ['운동', '다이어트', '헬스', '요가'],
  },
  {
    category: '부동산',
    keywords: ['아파트', '전세', '청약', '분양'],
  },
  {
    category: '구인구직',
    keywords: ['취업', '알바', '채용', '이직'],
  },
  {
    category: '성인',
    keywords: ['성인채널', '19금', '성인방'],
  },
  {
    category: '카지노',
    keywords: ['슬롯', '바카라', '토토', '배팅'],
  },
  {
    category: '기타',
    keywords: ['정보공유', '꿀팁', '모음집', '링크모음'],
  },
  {
    category: '증권',
    keywords: ['국내주식', '해외주식', '종목', '차트'],
  },
  {
    category: '해킹',
    keywords: ['보안', '정보보안', '사이버', '취약점'],
  },
  {
    category: '웹툰',
    keywords: ['만화', '네이버웹툰', '웹소설', '만화방'],
  },
];

export type DiscoveryKeywordSeed = {
  word: string;
  category: string;
  sort: number;
};

/** 카테고리 이름 + 대표 키워드. 앞선 순서를 유지하고 중복은 한 번만. */
export function flattenDiscoveryKeywordSeed(
  groups: DiscoveryKeywordGroup[] = DISCOVERY_KEYWORD_GROUPS,
): DiscoveryKeywordSeed[] {
  const seen = new Set<string>();
  const out: DiscoveryKeywordSeed[] = [];
  let sort = 0;
  for (const group of groups) {
    const parts = [group.category, ...group.keywords];
    for (const raw of parts) {
      const word = raw.trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({ word, category: group.category, sort });
      sort += 1;
    }
  }
  return out;
}

export function flattenDiscoveryKeywords(
  groups: DiscoveryKeywordGroup[] = DISCOVERY_KEYWORD_GROUPS,
): string[] {
  return flattenDiscoveryKeywordSeed(groups).map((row) => row.word);
}

export function shouldSeedDiscoveryKeywords(count: number): boolean {
  return count === 0;
}

export function newDiscoveryKeywordInsertRows(now = new Date()) {
  return flattenDiscoveryKeywordSeed().map((row) => ({
    id: randomUUID(),
    word: row.word,
    category: row.category,
    enabled: true,
    sort: row.sort,
    createdAt: now,
    lastSearchedAt: null as Date | null,
    lastFoundCount: null as number | null,
    totalNewCount: 0,
  }));
}

/** enabled 키워드: 한 번도 검색 안 한 것 먼저, 그다음 오래된 검색, 같으면 sort. */
export function pickKeywordsForSearch<
  T extends { lastSearchedAt: Date | string | null; sort: number },
>(rows: T[], cap: number): T[] {
  if (cap <= 0) return [];
  return [...rows]
    .sort((a, b) => {
      const aNull = a.lastSearchedAt == null ? 0 : 1;
      const bNull = b.lastSearchedAt == null ? 0 : 1;
      if (aNull !== bNull) return aNull - bNull;
      const at = a.lastSearchedAt ? new Date(a.lastSearchedAt).getTime() : 0;
      const bt = b.lastSearchedAt ? new Date(b.lastSearchedAt).getTime() : 0;
      if (at !== bt) return at - bt;
      return a.sort - b.sort;
    })
    .slice(0, cap);
}

/** 상한보다 키워드가 많으면 날짜마다 시작 위치를 밀어 전체를 돌아가며 검색합니다. */
export function rotateDiscoveryKeywords(
  keywords: string[],
  offset: number,
  cap: number,
): string[] {
  if (keywords.length === 0 || cap <= 0) return [];
  const start =
    ((Math.floor(offset) % keywords.length) + keywords.length) %
    keywords.length;
  const n = Math.min(cap, keywords.length);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(keywords[(start + i) % keywords.length]);
  }
  return out;
}

/**
 * 2차 추가 키워드 (2026-10-29). 처음 시드 뒤에 한 번만 없는 단어를 넣는다(app_settings 표시).
 * 관리자가 지운 단어는 표시가 있으면 다시 넣지 않는다.
 */
export const DISCOVERY_KEYWORD_SEED_V2_KEY = 'discovery-keywords:seed-v2';

export const DISCOVERY_KEYWORD_GROUPS_V2: DiscoveryKeywordGroup[] = [
  { category: '뉴스', keywords: ['뉴스속보', '국내뉴스', '정치', '사건사고'] },
  {
    category: '경제',
    keywords: ['경제뉴스', '미국주식', '배당', '금리', '부업', '짠테크'],
  },
  {
    category: '암호화폐',
    keywords: [
      '리플',
      '이더리움',
      '밈코인',
      '에어드랍',
      '바이낸스',
      '선물거래',
    ],
  },
  { category: '쇼핑', keywords: ['특가', '최저가', '무료나눔', '직구'] },
  { category: '교육', keywords: ['영어공부', '토익', '공무원', '수능'] },
  {
    category: '기술',
    keywords: ['아이폰', '갤럭시', '챗GPT', 'IT뉴스', '앱테크'],
  },
  {
    category: '엔터테인먼트',
    keywords: ['유튜브', '넷플릭스', '연예인', '아이돌정보'],
  },
  { category: '음악', keywords: ['음악추천', '힙합'] },
  { category: '게임', keywords: ['리니지', '메이플', '배그', '게임정보'] },
  {
    category: '스포츠',
    keywords: ['해외축구', '프로야구', '손흥민', '스포츠뉴스'],
  },
  {
    category: '커뮤니티',
    keywords: ['친목', '소통방', '대화방', '지역모임', '동호회'],
  },
  { category: '여행', keywords: ['국내여행', '캠핑', '일본여행'] },
  { category: '맛집', keywords: ['레시피', '요리'] },
  { category: '건강', keywords: ['건강정보', '러닝'] },
  { category: '부동산', keywords: ['부동산정보', '경매'] },
  { category: '구인구직', keywords: ['일자리', '재택부업'] },
  { category: '웹툰', keywords: ['웹툰추천', '애니'] },
  {
    category: '기타',
    keywords: ['한국', '대한민국', '공지방', '채널추천', '텔레그램채널'],
  },
];

/** 이미 있는 단어는 빼고, 기존 sort 뒤에 이어 붙일 행 */
export function discoveryKeywordV2InsertRows(
  existingWords: Iterable<string>,
  startSort: number,
  now = new Date(),
) {
  const seen = new Set([...existingWords].map((w) => w.trim()));
  let sort = startSort;
  const out: ReturnType<typeof newDiscoveryKeywordInsertRows> = [];
  for (const group of DISCOVERY_KEYWORD_GROUPS_V2) {
    for (const raw of group.keywords) {
      const word = raw.trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push({
        id: randomUUID(),
        word,
        category: group.category,
        enabled: true,
        sort,
        createdAt: now,
        lastSearchedAt: null,
        lastFoundCount: null,
        totalNewCount: 0,
      });
      sort += 1;
    }
  }
  return out;
}
