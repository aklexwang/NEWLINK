import {
  AI_DAILY_LIMIT_DEFAULT,
  AI_INPUT_MAX_CHARS,
  AiDailyBudget,
  aiSkipReason,
  cleanSuggestedCategory,
  buildAiUserPrompt,
  parseAiDailyLimit,
  parseAiVerdict,
  resolveAiConfig,
  shouldStopAiForToday,
} from './category-ai.logic';

const env = (values: Record<string, string>) => (key: string) => values[key];

describe('resolveAiConfig (제공자 선택)', () => {
  it('키가 없으면 null 이라 키워드만 쓴다', () => {
    expect(resolveAiConfig(env({}))).toBeNull();
    expect(resolveAiConfig(env({ AI_PROVIDER: 'deepseek' }))).toBeNull();
    expect(resolveAiConfig(env({ AI_API_KEY: '   ' }))).toBeNull();
    expect(resolveAiConfig(env({ AI_API_KEY: 'placeholder-key' }))).toBeNull();
  });

  it('AI_API_KEY 만 있으면 기본은 deepseek', () => {
    expect(resolveAiConfig(env({ AI_API_KEY: 'k1' }))).toEqual({
      provider: 'deepseek',
      apiKey: 'k1',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      dailyLimit: AI_DAILY_LIMIT_DEFAULT,
      legacy: false,
    });
  });

  it('AI_PROVIDER=openai 면 openai 기본 모델·주소를 쓴다', () => {
    const config = resolveAiConfig(
      env({ AI_PROVIDER: 'OpenAI', AI_API_KEY: 'k2' }),
    );
    expect(config).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
    });
  });

  it('알 수 없는 제공자 값은 deepseek 로 본다', () => {
    expect(
      resolveAiConfig(env({ AI_PROVIDER: 'whatever', AI_API_KEY: 'k' }))
        ?.provider,
    ).toBe('deepseek');
  });

  it('AI_MODEL·AI_BASE_URL·AI_DAILY_LIMIT 로 바꿀 수 있고 주소 끝 /는 뺀다', () => {
    const config = resolveAiConfig(
      env({
        AI_API_KEY: 'k',
        AI_MODEL: 'deepseek-reasoner',
        AI_BASE_URL: 'https://proxy.example.com/v1/',
        AI_DAILY_LIMIT: '50',
      }),
    );
    expect(config).toMatchObject({
      model: 'deepseek-reasoner',
      baseUrl: 'https://proxy.example.com/v1',
      dailyLimit: 50,
    });
  });

  it('예전 OPENAI_API_KEY 만 있으면 openai 로 계속 동작한다(하위 호환)', () => {
    const config = resolveAiConfig(
      env({
        OPENAI_API_KEY: 'sk-old',
        OPENAI_MODEL: 'gpt-4o',
        OPENAI_BASE_URL: 'https://api.openai.com/v1/',
      }),
    );
    expect(config).toEqual({
      provider: 'openai',
      apiKey: 'sk-old',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      dailyLimit: AI_DAILY_LIMIT_DEFAULT,
      legacy: true,
    });
  });

  it('AI_API_KEY 와 OPENAI_API_KEY 가 둘 다 있으면 AI_API_KEY 설정이 이긴다', () => {
    const config = resolveAiConfig(
      env({ AI_API_KEY: 'new', OPENAI_API_KEY: 'old' }),
    );
    expect(config).toMatchObject({ provider: 'deepseek', apiKey: 'new' });
  });

  it('하루 상한 값이 이상하면 기본 300', () => {
    expect(parseAiDailyLimit(undefined)).toBe(300);
    expect(parseAiDailyLimit('abc')).toBe(300);
    expect(parseAiDailyLimit('0')).toBe(300);
    expect(parseAiDailyLimit('-5')).toBe(300);
    expect(parseAiDailyLimit('120.9')).toBe(120);
  });
});

describe('aiSkipReason (호출 조건)', () => {
  const base = {
    configured: true,
    keyword: { category: '뉴스', confidence: 0.5, score: 1 },
    title: '소통방',
  };

  it('키워드 점수 0.7 이상이면 AI 를 부르지 않는다', () => {
    expect(
      aiSkipReason({ ...base, keyword: { ...base.keyword, confidence: 0.7 } }),
    ).toBe('confident');
    expect(
      aiSkipReason({ ...base, keyword: { ...base.keyword, confidence: 0.95 } }),
    ).toBe('confident');
  });

  it('0.7 미만이고 키가 있으면 호출 대상이다', () => {
    expect(aiSkipReason(base)).toBeNull();
    expect(
      aiSkipReason({ ...base, keyword: { ...base.keyword, confidence: 0.69 } }),
    ).toBeNull();
  });

  it('키가 없으면 키워드만 쓴다', () => {
    expect(aiSkipReason({ ...base, configured: false })).toBe('no_key');
  });

  it('마약 등 불법 의심은 제목·소개·글 어디든 AI 에 보내지 않는다', () => {
    expect(aiSkipReason({ ...base, title: '마약 정보방' })).toBe('illegal');
    expect(aiSkipReason({ ...base, description: '필로폰 판매합니다' })).toBe(
      'illegal',
    );
    expect(aiSkipReason({ ...base, posts: ['오늘의 대마초 시세'] })).toBe(
      'illegal',
    );
  });

  it('마약김밥 같은 음식 이름은 불법 의심이 아니다', () => {
    expect(aiSkipReason({ ...base, title: '마약김밥 맛집 모음' })).toBeNull();
  });

  it('키워드가 성인 근거를 찾았으면 AI 가 뒤집지 못하게 부르지 않는다', () => {
    expect(
      aiSkipReason({
        ...base,
        keyword: { category: '성인', confidence: 0.52, score: 1 },
      }),
    ).toBe('adult_keyword');
  });

  it('근거 없이 기본값이 성인일 일은 없지만 점수 0 이면 성인 보수 규칙은 적용하지 않는다', () => {
    expect(
      aiSkipReason({
        ...base,
        keyword: { category: '성인', confidence: 0.2, score: 0 },
      }),
    ).toBeNull();
  });
});

describe('buildAiUserPrompt (입력 길이 제한)', () => {
  it('제목·소개·글 발췌를 합쳐 2,000자를 넘지 않는다', () => {
    const prompt = buildAiUserPrompt({
      title: '가'.repeat(500),
      description: '나'.repeat(3000),
      posts: Array.from({ length: 20 }, () => '다'.repeat(800)),
    });
    expect(prompt.length).toBeLessThanOrEqual(AI_INPUT_MAX_CHARS);
    expect(prompt).toContain('title: ');
    expect(prompt).toContain('description: ');
  });

  it('짧은 입력은 그대로 담고 줄바꿈은 공백으로 줄인다', () => {
    const prompt = buildAiUserPrompt({
      title: '한국 뉴스',
      description: '첫 줄\n\n둘째 줄',
      posts: ['글 하나', '', '글 둘'],
    });
    expect(prompt).toBe(
      [
        'title: 한국 뉴스',
        'description: 첫 줄 둘째 줄',
        'post1: 글 하나',
        'post2: 글 둘',
      ].join('\n'),
    );
  });

  it('소개가 길면 뒤쪽 글 발췌는 잘려 나가고 제목은 항상 남는다', () => {
    const prompt = buildAiUserPrompt(
      { title: '제목', description: '가'.repeat(100), posts: ['글'] },
      60,
    );
    expect(prompt.length).toBeLessThanOrEqual(60);
    expect(prompt.startsWith('title: 제목')).toBe(true);
    expect(prompt).not.toContain('post1');
  });

  it('최근 글은 20개까지만 쓴다', () => {
    const prompt = buildAiUserPrompt({
      title: 't',
      posts: Array.from({ length: 30 }, (_, i) => `p${i}`),
    });
    expect(prompt).toContain('post20: ');
    expect(prompt).not.toContain('post21: ');
  });
});

describe('parseAiVerdict (우리 카테고리 안에서만)', () => {
  const allowed = ['뉴스', '게임', '기타'];

  it('JSON 응답을 읽는다', () => {
    expect(
      parseAiVerdict(
        '{"category":"뉴스","confidence":0.82,"reason":"x"}',
        allowed,
      ),
    ).toEqual({ category: '뉴스', confidence: 0.82, reason: 'x' });
  });

  it('코드블록으로 감싼 JSON 도 읽는다', () => {
    expect(
      parseAiVerdict(
        '```json\n{"category":"게임","confidence":0.9}\n```',
        allowed,
      ),
    ).toMatchObject({ category: '게임', confidence: 0.9 });
  });

  it('목록에 없는 카테고리는 버린다', () => {
    expect(
      parseAiVerdict('{"category":"해킹","confidence":0.99}', allowed),
    ).toBeNull();
  });

  it('깨진 JSON·빈 응답은 null', () => {
    expect(parseAiVerdict('뉴스입니다', allowed)).toBeNull();
    expect(parseAiVerdict('', allowed)).toBeNull();
    expect(parseAiVerdict(null, allowed)).toBeNull();
  });

  it('신뢰도는 0~1 로 맞추고 없으면 0.5', () => {
    expect(
      parseAiVerdict('{"category":"뉴스","confidence":7}', allowed)?.confidence,
    ).toBe(1);
    expect(
      parseAiVerdict('{"category":"뉴스","confidence":-1}', allowed)
        ?.confidence,
    ).toBe(0);
    expect(parseAiVerdict('{"category":"뉴스"}', allowed)?.confidence).toBe(
      0.5,
    );
  });
});

describe('AiDailyBudget (하루 상한)', () => {
  it('상한까지만 허용하고 그 뒤는 거절한다', () => {
    const budget = new AiDailyBudget(
      2,
      () => new Date('2026-10-25T10:00:00+09:00'),
    );
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      used: 2,
      limit: 2,
      stopped: true,
    });
  });

  it('날짜(KST)가 바뀌면 0 부터 다시 센다', () => {
    let now = new Date('2026-10-25T23:59:00+09:00');
    const budget = new AiDailyBudget(1, () => now);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(false);
    now = new Date('2026-10-26T00:01:00+09:00');
    expect(budget.snapshot().used).toBe(0);
    expect(budget.tryAcquire()).toBe(true);
  });

  it('오늘 중단하면 상한이 남아도 거절하고 다음 날 풀린다', () => {
    let now = new Date('2026-10-25T12:00:00+09:00');
    const budget = new AiDailyBudget(10, () => now);
    budget.stopToday('HTTP 429');
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      stopped: true,
      stopReason: 'HTTP 429',
    });
    now = new Date('2026-10-26T09:00:00+09:00');
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.snapshot().stopReason).toBeNull();
  });
});

describe('shouldStopAiForToday', () => {
  it('429·5xx·인증/결제 오류는 오늘 중단', () => {
    for (const status of [429, 500, 502, 503, 401, 402, 403]) {
      expect(shouldStopAiForToday(status)).toBe(true);
    }
  });
  it('그 밖의 4xx 는 중단하지 않는다', () => {
    for (const status of [400, 404, 422]) {
      expect(shouldStopAiForToday(status)).toBe(false);
    }
  });
});

describe('새 카테고리 제안', () => {
  const allowed = ['뉴스', '게임', '기타'];

  it('응답의 newCategory 를 받는다', () => {
    expect(
      parseAiVerdict(
        '{"category":"기타","confidence":0.3,"newCategory":"웹소설"}',
        allowed,
      )?.newCategory,
    ).toBe('웹소설');
  });

  it('이미 있는 이름·없음·너무 긴 이름은 버린다', () => {
    expect(cleanSuggestedCategory('뉴스', allowed)).toBeNull();
    expect(cleanSuggestedCategory(' 게 임 ', allowed)).toBeNull();
    expect(cleanSuggestedCategory('null', allowed)).toBeNull();
    expect(cleanSuggestedCategory('없음', allowed)).toBeNull();
    expect(
      cleanSuggestedCategory('아주아주아주긴카테고리이름', allowed),
    ).toBeNull();
    expect(cleanSuggestedCategory(null, allowed)).toBeNull();
    expect(cleanSuggestedCategory('"코인 선물"', allowed)).toBe('코인 선물');
  });
});
