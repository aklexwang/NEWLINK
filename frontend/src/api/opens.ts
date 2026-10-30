import { API_BASE, apiClient } from './client';

/**
 * "텔레그램에서 열기" 클릭을 서버에 알린다.
 * 링크 이동을 막거나 늦추지 않도록 응답을 기다리지 않고, 실패해도 조용히 넘어간다.
 * 로그인 정보(Authorization / initData)를 헤더로 보내야 해서 sendBeacon 대신
 * fetch(keepalive) 를 쓴다. 페이지가 바뀌어도 요청은 끝까지 전송된다.
 */
export function trackTelegramOpen(channelId: string | undefined | null): void {
  if (!channelId) return;
  try {
    const common = apiClient.defaults.headers.common as Record<string, unknown>;
    const headers: Record<string, string> = {};
    const authorization = common.Authorization;
    const initData = common['X-Telegram-Init-Data'];
    if (typeof authorization === 'string' && authorization) headers.Authorization = authorization;
    if (typeof initData === 'string' && initData) headers['X-Telegram-Init-Data'] = initData;

    void fetch(`${API_BASE}/channels/${encodeURIComponent(channelId)}/telegram-open`, {
      method: 'POST',
      keepalive: true,
      headers,
    }).catch(() => undefined);
  } catch {
    // 기록 실패가 링크 이동에 영향을 주면 안 된다.
  }
}