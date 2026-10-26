import { ConfigService } from '@nestjs/config';
import { resolveCategoryWithConfidence } from '../channels/auto-expose.logic';
import { CategoryAiService } from './category-ai.service';

const ALLOWED = ['뉴스', '게임', '성인', '기타'];

// 키워드 점수가 0.7 미만(소개글 한 번만 걸림)이라 AI 후보가 되는 입력
const LOW_KEYWORD = {
  title: '우리 소통방',
  description: '뉴스',
  allowedCategories: ALLOWED,
};
// 키워드 점수가 0.7 이상이라 AI 가 필요 없는 입력
const HIGH_KEYWORD = {
  title: '한국 뉴스 속보 채널',
  description: '오늘의 뉴스 속보와 정치 소식',
  allowedCategories: ALLOWED,
};

function build(env: Record<string, string>) {
  const repo = {
    find: () => Promise.resolve([{ name: '뉴스' }, { name: '게임' }]),
  } as unknown as ConstructorParameters<typeof CategoryAiService>[1];
  return new CategoryAiService(new ConfigService(env), repo);
}

function okResponse(category: string, confidence: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({ category, confidence, reason: 'r' }),
          },
        },
      ],
    }),
  };
}

function errorResponse(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

describe('CategoryAiService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('전제: 테스트 입력의 키워드 점수가 기대대로다', () => {
    const service = build({});
    expect(
      service.classifyByKeywords(LOW_KEYWORD, ALLOWED).confidence,
    ).toBeLessThan(0.7);
    expect(
      service.classifyByKeywords(HIGH_KEYWORD, ALLOWED).confidence,
    ).toBeGreaterThanOrEqual(0.7);
  });

  describe('제공자 선택', () => {
    it('기본은 deepseek: 주소·모델·키·JSON 응답 형식을 쓴다', async () => {
      fetchMock.mockResolvedValue(okResponse('뉴스', 0.9));
      const result = await build({ AI_API_KEY: 'key-1' }).classify(LOW_KEYWORD);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer key-1',
      );
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('deepseek-chat');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(result).toMatchObject({
        category: '뉴스',
        confidence: 0.9,
        source: 'ai',
      });
    });

    it('AI_PROVIDER=openai 면 openai 주소·모델로 부른다', async () => {
      fetchMock.mockResolvedValue(okResponse('뉴스', 0.9));
      await build({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' }).classify(
        LOW_KEYWORD,
      );
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(JSON.parse(init.body as string).model).toBe('gpt-4o-mini');
    });

    it('AI_MODEL·AI_BASE_URL 을 따른다', async () => {
      fetchMock.mockResolvedValue(okResponse('뉴스', 0.9));
      await build({
        AI_API_KEY: 'k',
        AI_MODEL: 'm-x',
        AI_BASE_URL: 'https://gw.example.com/v1/',
      }).classify(LOW_KEYWORD);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://gw.example.com/v1/chat/completions');
      expect(JSON.parse(init.body as string).model).toBe('m-x');
    });

    it('예전 OPENAI_API_KEY 만 있어도 openai 로 동작한다', async () => {
      fetchMock.mockResolvedValue(okResponse('뉴스', 0.9));
      const service = build({ OPENAI_API_KEY: 'sk-old' });
      expect(service.isConfigured()).toBe(true);
      await service.classify(LOW_KEYWORD);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-old',
      );
    });

    it('키가 없으면 AI 를 부르지 않고 키워드 결과를 쓴다', async () => {
      const service = build({});
      expect(service.isConfigured()).toBe(false);
      const result = await service.classify(LOW_KEYWORD);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        source: 'fallback',
        skipReason: 'no_key',
      });
    });
  });

  describe('호출 조건', () => {
    it('키워드 점수 0.7 이상이면 키가 있어도 AI 를 부르지 않는다', async () => {
      const result = await build({ AI_API_KEY: 'k' }).classify(HIGH_KEYWORD);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        category: '뉴스',
        source: 'fallback',
        skipReason: 'confident',
      });
    });

    it('0.7 미만이면 AI 결과를 쓴다', async () => {
      fetchMock.mockResolvedValue(okResponse('게임', 0.85));
      const result = await build({ AI_API_KEY: 'k' }).classify(LOW_KEYWORD);
      expect(result).toMatchObject({
        category: '게임',
        confidence: 0.85,
        source: 'ai',
      });
    });

    it('AI 신뢰도가 0.7 미만이면 호출한 쪽에서 분류대기가 된다', async () => {
      fetchMock.mockResolvedValue(okResponse('게임', 0.6));
      const result = await build({ AI_API_KEY: 'k' }).classify(LOW_KEYWORD);
      expect(result.source).toBe('ai');
      expect(
        resolveCategoryWithConfidence(result.category, result.confidence),
      ).toEqual({
        category: '분류대기',
        pending: true,
      });
    });

    it('우리 카테고리 목록 밖 답은 버리고 키워드 결과를 쓴다', async () => {
      fetchMock.mockResolvedValue(okResponse('해킹', 0.99));
      const result = await build({ AI_API_KEY: 'k' }).classify(LOW_KEYWORD);
      expect(result.source).toBe('fallback');
      expect(result.skipReason).toBe('error');
      // 응답 형식 오류이므로 한 번 더 시도한다
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('마약 등 불법 의심 채널은 AI 에 보내지 않는다', async () => {
      const service = build({ AI_API_KEY: 'k' });
      const byTitle = await service.classify({
        ...LOW_KEYWORD,
        title: '마약 정보방',
      });
      const byDescription = await service.classify({
        ...LOW_KEYWORD,
        description: '필로폰 팝니다',
      });
      const byPosts = await service.classify({
        ...LOW_KEYWORD,
        posts: ['대마초 시세 공유'],
      });
      expect(fetchMock).not.toHaveBeenCalled();
      for (const result of [byTitle, byDescription, byPosts]) {
        expect(result).toMatchObject({
          source: 'fallback',
          skipReason: 'illegal',
        });
      }
    });

    it('키워드가 성인 근거를 찾았으면 AI 를 부르지 않는다', async () => {
      const service = build({ AI_API_KEY: 'k' });
      const input = {
        title: '우리방',
        description: '야동',
        allowedCategories: ALLOWED,
      };
      const keyword = service.classifyByKeywords(input, ALLOWED);
      expect(keyword.category).toBe('성인');
      expect(keyword.confidence).toBeLessThan(0.7);
      const result = await service.classify(input);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        category: '성인',
        skipReason: 'adult_keyword',
      });
    });

    it('요청 본문의 사용자 입력은 2,000자 안이다', async () => {
      fetchMock.mockResolvedValue(okResponse('뉴스', 0.9));
      await build({ AI_API_KEY: 'k' }).classify({
        title: '우리 소통방',
        description: '뉴스 '.repeat(2000),
        posts: Array.from({ length: 20 }, () => '글 '.repeat(500)),
        allowedCategories: ALLOWED,
      });
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const messages = JSON.parse(init.body as string).messages as {
        role: string;
        content: string;
      }[];
      const user = messages.find((m) => m.role === 'user');
      expect(user?.content.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('비용 보호', () => {
    it('하루 상한을 넘기면 AI 를 부르지 않고 키워드 결과를 쓴다', async () => {
      fetchMock.mockResolvedValue(okResponse('게임', 0.9));
      const service = build({ AI_API_KEY: 'k', AI_DAILY_LIMIT: '2' });
      const first = await service.classify(LOW_KEYWORD);
      const second = await service.classify(LOW_KEYWORD);
      const third = await service.classify(LOW_KEYWORD);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(first.source).toBe('ai');
      expect(second.source).toBe('ai');
      expect(third).toMatchObject({ source: 'fallback', skipReason: 'limit' });
      expect(service.status()).toMatchObject({
        today: 2,
        dailyMax: 2,
        stopped: true,
      });
    });

    it('기본 상한은 300', () => {
      expect(build({ AI_API_KEY: 'k' }).status()).toMatchObject({
        configured: true,
        provider: 'deepseek',
        today: 0,
        dailyMax: 300,
        stopped: false,
      });
      expect(build({}).status()).toMatchObject({
        configured: false,
        provider: null,
        dailyMax: 300,
      });
    });

    it.each([429, 500, 503])(
      'HTTP %i 이면 그날 AI 를 멈추고 키워드 결과를 유지한다',
      async (status) => {
        fetchMock.mockResolvedValue(errorResponse(status));
        const service = build({ AI_API_KEY: 'k' });
        const first = await service.classify(LOW_KEYWORD);
        expect(first).toMatchObject({
          source: 'fallback',
          skipReason: 'stopped',
        });
        // 재시도 없이 바로 멈춘다
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(service.status()).toMatchObject({
          stopped: true,
          stopReason: `HTTP ${status}`,
        });

        const second = await service.classify(LOW_KEYWORD);
        expect(second).toMatchObject({
          source: 'fallback',
          skipReason: 'stopped',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );

    it('일시 오류(네트워크·타임아웃)는 1회만 다시 시도한다', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(okResponse('뉴스', 0.9));
      const result = await build({ AI_API_KEY: 'k' }).classify(LOW_KEYWORD);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.source).toBe('ai');
    });

    it('재시도까지 실패하면 키워드 결과를 쓰고 더 부르지 않는다', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const service = build({ AI_API_KEY: 'k' });
      const result = await service.classify(LOW_KEYWORD);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ source: 'fallback', skipReason: 'error' });
      expect(service.status().today).toBe(2);
    });

    it('재시도도 호출 상한을 소모한다', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const service = build({ AI_API_KEY: 'k', AI_DAILY_LIMIT: '1' });
      const result = await service.classify(LOW_KEYWORD);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.source).toBe('fallback');
      expect(service.status().today).toBe(1);
    });

    it('오류 로그와 결과에 키가 새지 않는다', async () => {
      fetchMock.mockResolvedValue(errorResponse(429));
      const service = build({ AI_API_KEY: 'secret-key-value' });
      const result = await service.classify(LOW_KEYWORD);
      expect(JSON.stringify(result)).not.toContain('secret-key-value');
      expect(JSON.stringify(service.status())).not.toContain(
        'secret-key-value',
      );
    });
  });
});

describe('CategoryAiService.categoryNames', () => {
  it('어드민에서 켜 둔 카테고리를 쓴다', async () => {
    await expect(build({}).categoryNames()).resolves.toEqual(['뉴스', '게임']);
  });

  it('비어 있으면 기본 목록', async () => {
    const repo = {
      find: () => Promise.resolve([]),
    } as unknown as ConstructorParameters<typeof CategoryAiService>[1];
    const names = await new CategoryAiService(
      new ConfigService({}),
      repo,
    ).categoryNames();
    expect(names).toContain('홍보');
  });
});
