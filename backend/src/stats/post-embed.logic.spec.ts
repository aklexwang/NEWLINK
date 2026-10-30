import { isTelegramImageUrl, parsePostEmbedHtml } from './post-embed.logic';

const html = `
<div class="tgme_widget_message" data-post="seebullreal/123">
  <a class="tgme_widget_message_photo_wrap" style="width:300px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>
  <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://evil.example.com/x.jpg')"></a>
  <div class="tgme_widget_message_text js-message_text">코스피, 매도 사이드카 발동.<br><br><br>국장도 오늘 고생입니다.</div>
  <span class="tgme_widget_message_views">1.2K</span>
  <time datetime="2026-10-30T03:12:33+00:00" class="time">12:12</time>
</div>`;

describe('텔레그램 글 직접 그리기 정보', () => {
  it('글·사진(텔레그램 주소만)·조회수·시간을 뽑는다', () => {
    const p = parsePostEmbedHtml(html);
    expect(p).toEqual({
      text: '코스피, 매도 사이드카 발동.\n\n국장도 오늘 고생입니다.',
      images: ['https://cdn4.telesco.pe/file/abc.jpg'],
      hasVideo: false,
      views: 1200,
      postedAt: '2026-10-30T03:12:33+00:00',
    });
  });

  it('글도 사진도 없으면 null', () => {
    expect(
      parsePostEmbedHtml('<div class="tgme_widget_message"></div>'),
    ).toBeNull();
    expect(parsePostEmbedHtml('<html></html>')).toBeNull();
  });

  it('이미지 주소 검사', () => {
    expect(isTelegramImageUrl('https://cdn1.telesco.pe/file/a.jpg')).toBe(true);
    expect(isTelegramImageUrl('http://cdn1.telesco.pe/file/a.jpg')).toBe(false);
    expect(isTelegramImageUrl('https://telesco.pe.evil.com/a.jpg')).toBe(false);
  });
});
