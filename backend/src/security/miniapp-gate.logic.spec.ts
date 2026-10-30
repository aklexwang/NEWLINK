import {
  decideMiniAppGate,
  describeClient,
  isOpenPath,
  miniAppGateMode,
  SlidingRateLimiter,
} from './miniapp-gate.logic';

describe('미니앱 전용 문지기', () => {
  const base = {
    enabled: true,
    method: 'GET',
    hasValidInitData: false,
    hasValidAdmin: false,
  };

  it('텔레그램 서명 없는 공개 목록 요청은 막는다', () => {
    expect(decideMiniAppGate({ ...base, path: '/api/channels/search' })).toBe(
      'deny',
    );
    expect(decideMiniAppGate({ ...base, path: '/api/ranking/channels' })).toBe(
      'deny',
    );
    expect(decideMiniAppGate({ ...base, path: '/api/stats/feed' })).toBe(
      'deny',
    );
    expect(decideMiniAppGate({ ...base, path: '/api/seo/sitemap' })).toBe(
      'deny',
    );
  });

  it('서명이 있거나 관리자면 통과', () => {
    expect(
      decideMiniAppGate({
        ...base,
        path: '/api/channels/search',
        hasValidInitData: true,
      }),
    ).toBe('allow');
    expect(
      decideMiniAppGate({
        ...base,
        path: '/api/categories',
        hasValidAdmin: true,
      }),
    ).toBe('allow');
  });

  it('어드민·내부·로그인·이미지·결제 알림은 열어 둔다', () => {
    for (const p of [
      '/api/admin/stats/ops',
      '/api/internal/stats/run',
      '/api/auth/telegram',
      '/api/images/abc',
      '/api/media/avatar/x',
      '/api/payments/webhook',
      '/api/health',
      '/api/ads/banners/123e4567-e89b-12d3-a456-426614174000/image',
      '/api/channels/123e4567-e89b-12d3-a456-426614174000/telegram-open',
      '/api/ads/banners/123e4567-e89b-12d3-a456-426614174000/click',
    ]) {
      expect(isOpenPath(p)).toBe(true);
    }
    expect(isOpenPath('/api/ads/banners')).toBe(false);
    expect(
      decideMiniAppGate({
        ...base,
        method: 'OPTIONS',
        path: '/api/channels/search',
      }),
    ).toBe('allow');
  });

  it('꺼져 있으면 다 통과, 기본은 지켜보기', () => {
    expect(
      decideMiniAppGate({
        ...base,
        enabled: false,
        path: '/api/channels/search',
      }),
    ).toBe('allow');
    expect(miniAppGateMode(undefined)).toBe('watch');
    expect(miniAppGateMode('false')).toBe('off');
    expect(miniAppGateMode('true')).toBe('block');
    expect(miniAppGateMode('block')).toBe('block');
  });

  it('1분에 정해진 수를 넘으면 막는다', () => {
    const rl = new SlidingRateLimiter(3, 60_000);
    expect([
      rl.allow('u', 0),
      rl.allow('u', 1),
      rl.allow('u', 2),
      rl.allow('u', 3),
    ]).toEqual([true, true, true, false]);
    expect(rl.allow('u', 61_000)).toBe(true);
    expect(rl.allow('other', 3)).toBe(true);
  });
});

describe('서명 없는 요청 종류', () => {
  it('User-Agent 를 종류로만 줄인다', () => {
    expect(describeClient('TelegramBot (like TwitterBot)')).toBe(
      '링크 미리보기 봇',
    );
    expect(describeClient('python-requests/2.31')).toBe('봇·스크립트');
    expect(
      describeClient('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Telegram-iOS'),
    ).toBe('텔레그램 앱 내 브라우저');
    expect(
      describeClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'),
    ).toBe('PC 브라우저');
  });
});
