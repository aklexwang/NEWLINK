import {
  buildSearchLogText,
  checkSearchText,
  maskDigitRuns,
  normalizeForBlocking,
  normalizeForLog,
  validateTermInput,
  type SearchTermSets,
} from './search-text.logic';

const sets: SearchTermSets = {
  block: [normalizeForBlocking('마약')],
  allow: [normalizeForBlocking('마약김밥')],
};

describe('normalizeForBlocking', () => {
  it('공백·기호·문장부호·밑줄·제로폭을 지우고 한글·영문·숫자만 남긴다', () => {
    expect(normalizeForBlocking('마.약')).toBe('마약');
    expect(normalizeForBlocking('마-약')).toBe('마약');
    expect(normalizeForBlocking('마_약')).toBe('마약');
    expect(normalizeForBlocking('마 약')).toBe('마약');
    expect(normalizeForBlocking('마\u200b약')).toBe('마약');
    expect(normalizeForBlocking('마★약!?')).toBe('마약');
  });

  it('전각 영문·숫자는 반각으로, 대문자는 소문자로 통일한다', () => {
    expect(normalizeForBlocking('ＤＲＵＧ １２３')).toBe('drug123');
    expect(normalizeForBlocking('Drug')).toBe('drug');
  });

  it('빈 값은 빈 문자열', () => {
    expect(normalizeForBlocking(undefined)).toBe('');
    expect(normalizeForBlocking('   ')).toBe('');
  });
});

describe('checkSearchText', () => {
  it.each(['마약', '마.약', '마-약', '마_약', '마 약', '  마약 판매  '])(
    '금지어 "마약" 이 "%s" 에서 차단된다',
    (query) => {
      expect(checkSearchText(query, sets).blocked).toBe(true);
    },
  );

  it('금지어가 없으면 허용한다', () => {
    expect(checkSearchText('맛집 모음', sets).blocked).toBe(false);
    expect(checkSearchText('', sets).blocked).toBe(false);
    expect(checkSearchText(undefined, sets).blocked).toBe(false);
  });

  it('예외어가 금지어를 완전히 덮으면 허용한다', () => {
    expect(checkSearchText('마약김밥 맛집', sets).blocked).toBe(false);
    expect(checkSearchText('마.약 김-밥', sets).blocked).toBe(false);
  });

  it('예외어가 있어도 덮이지 않은 금지어가 하나라도 있으면 차단한다', () => {
    expect(checkSearchText('마약김밥 마약', sets).blocked).toBe(true);
    expect(checkSearchText('마약 마약김밥', sets).blocked).toBe(true);
  });

  it('예외어도 같은 정규화를 쓴다', () => {
    const custom: SearchTermSets = {
      block: ['마약'],
      allow: [normalizeForBlocking('마약 김밥!')],
    };
    expect(checkSearchText('마약김밥', custom).blocked).toBe(false);
  });

  it('금지어가 여러 개여도 동작한다', () => {
    const multi: SearchTermSets = { block: ['마약', 'drug'], allow: [] };
    expect(checkSearchText('Ｄｒｕｇ shop', multi).blocked).toBe(true);
  });
});

describe('validateTermInput', () => {
  it('정규화 후 2자 미만이면 거절한다', () => {
    expect('error' in validateTermInput('약')).toBe(true);
    expect('error' in validateTermInput('.-_')).toBe(true);
    expect('error' in validateTermInput('')).toBe(true);
  });

  it('2자 이상이면 정규화한 값을 돌려준다', () => {
    expect(validateTermInput('마.약')).toEqual({ normalized: '마약' });
  });

  it('64자를 넘으면 거절한다', () => {
    expect('error' in validateTermInput('가'.repeat(65))).toBe(true);
  });
});

describe('검색 기록 문자열', () => {
  it('7자리 이상 숫자 덩어리는 # 으로 가린다', () => {
    expect(maskDigitRuns('010-1234-5678 문의')).toBe('# 문의');
    expect(maskDigitRuns('1234567')).toBe('#');
    expect(maskDigitRuns('코인 123456')).toBe('코인 123456');
  });

  it('이메일 모양은 기록하지 않는다', () => {
    expect(buildSearchLogText('abc@example.com')).toBeNull();
  });

  it('원문은 100자까지만 저장한다', () => {
    const built = buildSearchLogText('가'.repeat(150));
    expect(built?.raw.length).toBe(100);
    expect(built?.normalized.length).toBe(100);
  });

  it('정규화 값은 공백·기호가 달라도 같다', () => {
    expect(buildSearchLogText('Coin  Talk!')?.normalized).toBe('cointalk');
    expect(buildSearchLogText('coin-talk')?.normalized).toBe('cointalk');
  });

  it('한글·영문·숫자가 없는 검색어도 기록한다', () => {
    expect(normalizeForLog('大麻 販売')).toBe('大麻販売');
    expect(buildSearchLogText('大麻 販売')?.normalized).toBe('大麻販売');
  });

  it('빈 검색어는 기록하지 않는다', () => {
    expect(buildSearchLogText('   ')).toBeNull();
    expect(buildSearchLogText(undefined)).toBeNull();
  });
});
