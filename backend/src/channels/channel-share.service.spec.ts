import { buildShareArticle } from './channel-share.service';

describe('buildShareArticle', () => {
  it('카테고리·신규·운영자 인증 줄을 이름과 회원 수 사이에 넣는다', () => {
    const c = buildShareArticle({
      channelId: 'x', title: '가치투자클럽', memberCount: 67147, botUsername: 'telllink_bot',
      category: '경제', isNew: true, isVerified: true,
    });
    expect(c.input_message_content.message_text.split('\n')).toEqual([
      '<a href="https://t.me/telllink_bot?startapp=c_x">가치투자클럽</a>',
      '경제 · 신규 · 운영자 인증',
      '회원 67,147명',
    ]);
  });

  const a = buildShareArticle({
    channelId: 'b926b109-7618-4142-aa6c-270758e8d847',
    title: 'IDNARA 공지채널',
    memberCount: 161303,
    botUsername: 'telllink_bot',
  });

  it('버튼 없이, 채널 이름을 누르면 텔링크의 이 채널로 열린다', () => {
    expect('reply_markup' in a).toBe(false);
    expect(a.input_message_content.message_text).toContain(
      '<a href="https://t.me/telllink_bot?startapp=c_b926b109-7618-4142-aa6c-270758e8d847">IDNARA 공지채널</a>',
    );
  });

  it('안내 문구는 넣지 않고, 이름의 < > & 는 바꿔 넣는다', () => {
    const b = buildShareArticle({ channelId: 'x', title: 'A<B>&C', memberCount: null, botUsername: 'telllink_bot' });
    expect(b.input_message_content.message_text).toBe('<a href="https://t.me/telllink_bot?startapp=c_x">A&lt;B&gt;&amp;C</a>');
    expect(a.input_message_content.message_text).not.toContain('텔링크에서');
  });

  it('결과 id 는 64바이트 이하', () => {
    expect(Buffer.byteLength(a.id)).toBeLessThanOrEqual(64);
  });

  it('회원 수를 넣는다', () => {
    expect(a.input_message_content.message_text).toMatch(/\n회원 161,303명$/);
  });
});
