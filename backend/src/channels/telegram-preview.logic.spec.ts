import {
  resolvePreviewRequestUrl,
  telegramPreviewFromHtml,
} from './telegram-preview.logic';

describe('telegramPreviewFromHtml', () => {
  it('초대 페이지는 og:title 없이 .tgme_page_title 을 읽고 공백을 지워지 않는다', () => {
    const preview = telegramPreviewFromHtml({
      html: `<div class="tgme_page_title">테더천국 장외거래 소통방</div>
        <div class="tgme_page_extra">558 members</div>
        <div class="tgme_page_description">장외 소통</div>`,
      status: 200,
      finalUrl: 'https://t.me/+uI8tNLAF57MzMThk',
      requestUrl: 'https://t.me/+uI8tNLAF57MzMThk',
    });
    expect(preview.title).toBe('테더천국 장외거래 소통방');
    expect(preview.kind).toBe('group');
    expect(preview.memberCount).toBe(558);
  });

  it('초대 링크 extra 가 subscribers 이면 채널이다', () => {
    const preview = telegramPreviewFromHtml({
      html: `<div class="tgme_page_title">한국뉴스채널</div>
        <div class="tgme_page_extra">1 200 subscribers</div>`,
      status: 200,
      requestUrl: 'https://t.me/+InviteHash12',
    });
    expect(preview.kind).toBe('channel');
  });

  it('api.telegram.org/file/bot 사진은 미리보기에 넣지 않는다', () => {
    const preview = telegramPreviewFromHtml({
      html: `<div class="tgme_page_title">한국뉴스속보채널</div>
        <div class="tgme_page_extra">1 200 subscribers</div>
        <meta property="og:image" content="https://api.telegram.org/file/botSECRET/x.jpg">`,
      status: 200,
      requestUrl: 'https://t.me/NewsKorea',
    });
    expect(preview.kind).toBe('channel');
    expect(preview.avatarUrl).toBeNull();
  });
});

describe('resolvePreviewRequestUrl', () => {
  it('t.me / telegram.me 만 받고 다른 호스트는 빈다', () => {
    expect(resolvePreviewRequestUrl('https://t.me/NewsKorea')).toBe(
      'https://t.me/NewsKorea',
    );
    expect(resolvePreviewRequestUrl('https://telegram.me/NewsKorea')).toBe(
      'https://telegram.me/NewsKorea',
    );
    expect(resolvePreviewRequestUrl('@NewsKorea')).toBe(
      'https://t.me/NewsKorea',
    );
    expect(resolvePreviewRequestUrl('https://evilt.me/x')).toBeNull();
    expect(resolvePreviewRequestUrl('https://example.com/t.me/x')).toBeNull();
  });
});
