import { CATEGORY_CONFIDENCE_MIN } from './auto-expose.logic';

export const TITLE_SCORE = 3;
export const DESCRIPTION_SCORE = 2;
export const POST_SCORE = 1;
export const POST_MATCH_CAP = 5;

type KeywordRule = {
  category: string;
  titleDesc: RegExp[];
  posts?: RegExp[];
  titleDescOnly?: boolean;
  /** 소개글에서 "야동 금지" 같은 규칙 문장 속 단어는 근거로 치지 않는다 */
  ignoreProhibited?: boolean;
};

/**
 * 규칙·금지 문장으로 보는 말. 홍보방 소개글의 "야동·19금 홍보 금지", "도박 홍보 불가" 등.
 * 이 말이 단어 앞뒤 가까이에 있으면 그 단어는 채널 주제가 아니라 금지 목록이다.
 */
export const PROHIBIT_NEAR_RE =
  /금지|불가|불허|사절|차단|강퇴|추방|퇴장|퇴출|제재|제한|빼고|금함|일절|절대|안\s*됩니다|안\s*됨|하지\s*마|올리지|ㄴㄴ|❌|🚫|⛔|\bno\b|not\s+allowed|prohibited|banned/i;

/** 규칙 문장이 아닌 곳에서 pattern 이 한 번이라도 나오면 true */
export function hitOutsideProhibited(text: string, pattern: RegExp): boolean {
  if (!text) return false;
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // 같은 줄 안에서 앞 20자·뒤 25자만 본다
    const lineStart = text.lastIndexOf('\n', start) + 1;
    const nl = text.indexOf('\n', end);
    const lineEnd = nl < 0 ? text.length : nl;
    const around = text.slice(
      Math.max(lineStart, start - 20),
      Math.min(lineEnd, end + 25),
    );
    if (!PROHIBIT_NEAR_RE.test(around)) return true;
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return false;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    category: '성인',
    titleDescOnly: true,
    ignoreProhibited: true,
    titleDesc: [
      /섹스|야동|야설|성인물|포르노|에로물|야한동|유부녀|원나잇|조건만남|출장안마|폰섹|텔레야동|소라넷|야동방/,
      /\b(sex|porn|porno|xxx|nsfw|onlyfans|hentai)\b/i,
      /18\s*\+/,
    ],
  },
  {
    category: '카지노',
    titleDescOnly: true,
    ignoreProhibited: true,
    titleDesc: [
      /카지노|바카라|스포츠토토|도박|\b(casino|baccarat|betting)\b/i,
      /토토(?!로)/,
    ],
  },
  {
    category: '암호화폐',
    titleDesc: [
      /crypto|bitcoin|\bbtc\b|\beth\b|nft|디파이|코인|암호화폐|블록체인|\bton\b|USDT|가상자산|업비트/i,
    ],
    posts: [
      /crypto|bitcoin|\bbtc\b|\beth\b|nft|디파이|코인|암호화폐|블록체인|USDT|가상자산|업비트/i,
    ],
  },
  {
    category: '뉴스',
    titleDesc: [/news|뉴스|속보|언론|신문|뉴스타파|헤드라인/i],
    posts: [/뉴스|속보|언론|신문|헤드라인/i],
  },
  {
    category: '경제',
    titleDesc: [
      /경제|주식|증권|투자|펀드|환율|finance|\bstock\b|trading|재테크/i,
    ],
    posts: [/경제|주식|증권|투자|펀드|환율|재테크/i],
  },
  {
    category: '홍보',
    titleDesc: [/홍보방|자유홍보|무한홍보|총판|홍보채널|홍보\s*모음/],
    posts: [/홍보방|자유홍보|무한홍보|총판/],
  },
  {
    category: '쇼핑',
    titleDesc: [/쇼핑|할인|공구|핫딜|shopping|\bdeal\b|쿠폰|특가|알리미/i],
    posts: [/쇼핑|할인|공구|핫딜|쿠폰|특가/i],
  },
  {
    category: '교육',
    titleDesc: [/교육|강의|공부|학습|입시|토익|\bpython\b|프로그래밍|공부방/i],
    posts: [/교육|강의|공부|학습|입시|토익|공부방/i],
  },
  {
    category: '기술',
    titleDesc: [
      /기술|개발|코딩|소프트웨어|개발자|프로그래밍|\b(IT|AI|tech|developer|software)\b/i,
    ],
    posts: [/개발자|코딩|소프트웨어|프로그래밍|개발/],
  },
  {
    category: '게임',
    titleDesc: [/게임|\bgame\b|e-?sport|롤|배그|스팀/i],
    posts: [/게임|\bgame\b|배그|스팀/i],
  },
  {
    category: '스포츠',
    titleDesc: [/스포츠|축구|야구|농구|\b(sport|football|soccer)\b/i],
    posts: [/스포츠|축구|야구|농구/i],
  },
  {
    category: '음악',
    titleDesc: [/음악|music|playlist|노래|케이팝|k-?pop/i],
    posts: [/음악|playlist|노래|케이팝|k-?pop/i],
  },
  {
    category: '엔터테인먼트',
    titleDesc: [
      /연예|예능|영화|드라마|유머|meme|entertainment|웹툰|웹튠|만화/i,
    ],
    posts: [/연예|예능|영화|드라마|유머|웹툰|만화/i],
  },
  {
    category: '여행',
    titleDesc: [/여행|관광|항공|호텔|travel|tour/i],
    posts: [/여행|관광|항공|호텔/i],
  },
  {
    category: '맛집',
    titleDesc: [/맛집|음식|요리|카페|food|restaurant/i],
    posts: [/맛집|음식|요리|카페/i],
  },
  {
    category: '건강',
    titleDesc: [/건강|운동|다이어트|헬스|fitness|health/i],
    posts: [/건강|운동|다이어트|헬스/i],
  },
  {
    category: '부동산',
    titleDesc: [/부동산|아파트|전세|매매|real\s*estate/i],
    posts: [/부동산|아파트|전세|매매/i],
  },
  {
    category: '구인구직',
    titleDesc: [/채용|구인|구직|알바|취업|\b(job|career|hiring)\b/i],
    posts: [/채용|구인|구직|알바|취업/i],
  },
  {
    category: '커뮤니티',
    titleDesc: [/커뮤니티|모임|동호회|박제|블랙리스트/i],
    posts: [/커뮤니티|모임|동호회|박제|블랙리스트/i],
  },
  {
    category: '반려동물',
    titleDesc: [/반려|강아지|고양이|펫샵|애견|유기견|입양분양/],
    posts: [/반려|강아지|고양이|애견|유기견/],
  },
  {
    category: '육아',
    titleDesc: [/육아|워킹맘|어린이집|유치원|출산|임신맘|아기띠/],
    posts: [/육아|워킹맘|어린이집|출산/],
  },
  {
    category: '종교',
    titleDesc: [/교회|성당|사찰|불교|기독교|예수님|성경|예배|불자|이슬람/],
    posts: [/교회|성당|사찰|불교|기독교|예배|이슬람/],
  },
];

function hitOnce(text: string, pattern: RegExp): boolean {
  if (!text) return false;
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function postHitCount(posts: string[], pattern: RegExp): number {
  let n = 0;
  for (const post of posts) {
    if (hitOnce(post, pattern)) n += 1;
  }
  return Math.min(POST_MATCH_CAP, n);
}

export type KeywordScoreInput = {
  title: string;
  description?: string;
  snippet?: string;
  topicHint?: string;
  posts?: string[];
  allowedCategories: string[];
};

export type KeywordScoreResult = {
  category: string;
  score: number;
  confidence: number;
  reason: 'keyword-score' | 'default';
};

export function confidenceFromScore(score: number): number {
  if (score <= 0) return 0.2;
  return Math.min(0.95, 0.4 + score * 0.12);
}

export function scoreKeywordCategory(
  input: KeywordScoreInput,
): KeywordScoreResult {
  const title = input.title ?? '';
  const description = [input.description, input.snippet]
    .filter(Boolean)
    .join('\n');
  const posts = input.posts ?? [];
  const topic = (input.topicHint ?? '').trim();
  const allowed = input.allowedCategories;

  let bestCategory = allowed.includes('기타') ? '기타' : (allowed[0] ?? '기타');
  let bestScore = 0;

  for (const rule of KEYWORD_RULES) {
    if (!allowed.includes(rule.category)) continue;
    let score = 0;
    for (const pattern of rule.titleDesc) {
      const hit = rule.ignoreProhibited ? hitOutsideProhibited : hitOnce;
      if (hit(title, pattern)) score += TITLE_SCORE;
      if (hit(description, pattern)) score += DESCRIPTION_SCORE;
    }
    if (!rule.titleDescOnly) {
      const postPatterns = rule.posts ?? rule.titleDesc;
      for (const pattern of postPatterns) {
        score += postHitCount(posts, pattern) * POST_SCORE;
      }
    }
    if (topic && topic === rule.category) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  if (bestScore <= 0) {
    return {
      category: bestCategory,
      score: 0,
      confidence: 0.2,
      reason: 'default',
    };
  }
  return {
    category: bestCategory,
    score: bestScore,
    confidence: confidenceFromScore(bestScore),
    reason: 'keyword-score',
  };
}

export function meetsCategoryConfidence(
  confidence: number,
  min = CATEGORY_CONFIDENCE_MIN,
): boolean {
  return confidence >= min;
}
