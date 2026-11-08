import { buildShareArticle } from './channel-share.service';

describe('buildShareArticle', () => {
  const a = buildShareArticle({
    channelId: 'b926b109-7618-4142-aa6c-270758e8d847',
    title: 'IDNARA 공지채널',
    memberCount: 161303,
    botUsername: 'telllink_bot',
  });

  it('미니앱 바로가기 버튼은 이 채널로 열린다', () => {
    expect(a.reply_markup.inline_keyboard[0][0].url).toBe(
      'https://t.me/telllink_bot?startapp=c_b926b109-7618-4142-aa6c-270758e8d847',
    );
  });

  it('결과 id 는 64바이트 이하', () => {
    expect(Buffer.byteLength(a.id)).toBeLessThanOrEqual(64);
  });

  it('회원 수를 넣는다', () => {
    expect(a.input_message_content.message_text).toContain('회원 161,303명');
  });
});
