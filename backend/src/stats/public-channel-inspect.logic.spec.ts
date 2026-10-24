import { PUBLIC_INSPECT_GAP_MS } from './public-channel-inspect.logic';
import {
  classifyTmeHref,
  isBulkProgressTick,
  parseBulkCandidatesArgs,
  parseUsernameListText,
  publicInspectDecision,
  shouldStopBulkAuto,
} from './public-channel-inspect.logic';
import { createPublicTelegramFetcher } from './public-telegram-fetch.logic';
import { parsePublicUsernamePage } from './telegram-preview-html';

describe('공개 페이지 확인', () => {
  it('요청 간격은 1초이다', () => {
    expect(PUBLIC_INSPECT_GAP_MS).toBe(1_000);
  });

  it('채널 페이지에서 종류·제목·소개·인원을 읽는다', () => {
    const parsed = parsePublicUsernamePage(`
      <div class="tgme_page_title"><span>뉴스채널</span></div>
      <div class="tgme_page_extra">12 345 subscribers</div>
      <div class="tgme_page_description">오늘 한국 소식입니다</div>
    `);
    expect(parsed).toMatchObject({
      kind: 'channel',
      title: '뉴스채널',
      description: '오늘 한국 소식입니다',
      memberCount: 12345,
    });
  });

  it('제목·소개가 한글이면 통과한다', () => {
    const decision = publicInspectDecision({
      kind: 'channel',
      title: '뉴스채널',
      description: '오늘 한국 소식을 전합니다',
      memberCount: 120,
      avatarUrl: null,
    });
    expect(decision.result).toBe('ok');
    expect(decision.language).toBe('ko');
  });

  it('채널은 최근 글 본문으로 한국어를 판별한다', () => {
    const decision = publicInspectDecision({
      kind: 'channel',
      title: 'Daily News',
      description: 'Official updates channel',
      memberCount: 500,
      avatarUrl: null,
      excerpts: [
        '오늘 한국 경제 뉴스를 정리합니다',
        '서울 날씨와 교통 소식입니다',
        '국회 본회의 결과를 전합니다',
        '증시 마감 상황을 공유합니다',
        '내일 일정 안내입니다 여러분',
      ],
    });
    expect(decision.result).toBe('ok');
    expect(decision.language).toBe('ko');
  });

  it('봇·없는 아이디·인원 부족·외국어는 탈락한다', () => {
    expect(
      publicInspectDecision({
        kind: 'invalid',
        title: 'Wallet',
        description: '',
        memberCount: 1000,
        avatarUrl: null,
      }).result,
    ).toBe('not_found');
    expect(
      publicInspectDecision({
        kind: 'channel',
        title: '뉴스채널',
        description: '오늘 한국 소식을 전합니다',
        memberCount: 99,
        avatarUrl: null,
      }).result,
    ).toBe('too_small');
    expect(
      publicInspectDecision({
        kind: 'channel',
        title: 'Telegram News',
        description: 'Official English updates',
        memberCount: 5000,
        avatarUrl: null,
        excerpts: [
          'Breaking news from Washington today',
          'Market closed higher in New York',
          'Official statement released this morning',
          'Further details will follow later',
          'Subscribe for more English updates',
        ],
      }).result,
    ).toBe('not_korean');
  });
});

describe('공개 페이지 429', () => {
  it('Retry-After 만큼 기다렸다가 다시 요청한다', async () => {
    const slept: number[] = [];
    let calls = 0;
    const fetcher = createPublicTelegramFetcher({
      gapMs: 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
      fetchFn: (async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            url: 'https://t.me/news',
            headers: new Headers({ 'retry-after': '3' }),
            text: async () => 'slow',
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          url: 'https://t.me/news',
          headers: new Headers(),
          text: async () => 'ok',
        } as Response;
      }) as typeof fetch,
    });
    const result = await fetcher.fetchHtml('https://t.me/news');
    expect(calls).toBe(2);
    expect(slept).toContain(3_000);
    expect(result.status).toBe(200);
    expect(result.html).toBe('ok');
  });
});

describe('t.me 링크 분류', () => {
  it('공개 아이디와 형식 오류를 가른다', () => {
    expect(classifyTmeHref('https://t.me/news_kr')).toEqual({
      kind: 'username',
      username: 'news_kr',
    });
    expect(classifyTmeHref('https://t.me/ab')).toEqual({
      kind: 'invalid_format',
      path: 'ab',
    });
    expect(classifyTmeHref('https://t.me/1news')).toEqual({
      kind: 'invalid_format',
      path: '1news',
    });
    expect(classifyTmeHref('https://t.me/+invitehash').kind).toBe('skip');
    expect(classifyTmeHref('https://t.me/helper_bot').kind).toBe('skip');
  });
});

describe('대량 도구 인자', () => {
  it('파일에서 username 을 읽고 auto 중단 조건을 계산한다', () => {
    expect(
      parseUsernameListText('# 주석\n@News_KR\nhttps://t.me/other_ch\nnews_kr\n'),
    ).toEqual(['news_kr', 'other_ch']);
    expect(parseBulkCandidatesArgs(['auto', '--dry-run', '--limit', '40', '--max-hours', '2']).mode).toBe(
      'auto',
    );
    expect(parseBulkCandidatesArgs(['verify', '--file', 'a.txt']).file).toBe('a.txt');
    expect(
      shouldStopBulkAuto({
        newCandidatesThisRound: 19,
        startedAtMs: 0,
        nowMs: 1000,
        maxHours: 8,
      }),
    ).toBe(true);
    expect(
      shouldStopBulkAuto({
        newCandidatesThisRound: 20,
        startedAtMs: 0,
        nowMs: 9 * 3600_000,
        maxHours: 8,
      }),
    ).toBe(true);
    expect(isBulkProgressTick(100)).toBe(true);
    expect(isBulkProgressTick(99)).toBe(false);
  });
});
