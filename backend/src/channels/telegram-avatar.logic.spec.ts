import {
  isAllowedAvatarDownloadHost,
  isTelegramBotFileUrl,
  parseTelegramAvatarPageLink,
  stripUnsafeAvatarUrl,
} from './telegram-avatar.logic';

describe('telegram-avatar.logic', () => {
  it('봇 파일 URL 은 저장·응답에서 버린다', () => {
    expect(
      isTelegramBotFileUrl(
        'https://api.telegram.org/file/botSECRET/photos/file.jpg',
      ),
    ).toBe(true);
    expect(
      stripUnsafeAvatarUrl(
        'https://api.telegram.org/file/botSECRET/photos/file.jpg',
      ),
    ).toBeNull();
    expect(stripUnsafeAvatarUrl('https://cdn4.telegram-cdn.org/file/a.jpg')).toBe(
      'https://cdn4.telegram-cdn.org/file/a.jpg',
    );
  });

  it('아바타 입력은 t.me·telegram.me 만 받고 evilt.me 를 막는다', () => {
    expect(parseTelegramAvatarPageLink('https://t.me/NewsKorea').ok).toBe(true);
    expect(parseTelegramAvatarPageLink('https://telegram.me/NewsKorea').ok).toBe(
      true,
    );
    expect(parseTelegramAvatarPageLink('https://evilt.me/x').ok).toBe(false);
    expect(parseTelegramAvatarPageLink('https://t.me.evil.com/x').ok).toBe(false);
    expect(parseTelegramAvatarPageLink(undefined, 'NewsKorea').ok).toBe(true);
  });

  it('다운로드 호스트는 정확한 도메인만 허용한다', () => {
    expect(isAllowedAvatarDownloadHost('cdn4.telegram-cdn.org')).toBe(true);
    expect(isAllowedAvatarDownloadHost('t.me')).toBe(true);
    expect(isAllowedAvatarDownloadHost('evilt.me')).toBe(false);
    expect(isAllowedAvatarDownloadHost('api.telegram.org')).toBe(false);
  });
});
