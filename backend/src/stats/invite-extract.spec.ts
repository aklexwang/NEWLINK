import { extractTmeInvitesFromText } from './telegram-preview-html';
import { mergeDiscoveryQueue } from './channel-discovery.logic';

describe('비공개 초대 링크 모으기', () => {
  it('t.me/+ 와 joinchat 링크를 대소문자 그대로 모은다', () => {
    const text =
      '백업방 https://t.me/+AbCdEf123456_x 와 t.me/joinchat/ZZyyXX998877 그리고 다시 t.me/+AbCdEf123456_x';
    expect(extractTmeInvitesFromText(text)).toEqual(['+AbCdEf123456_x', '+ZZyyXX998877']);
  });

  it('공개 아이디·짧은 값은 빼고, html 링크 속 주소도 찾는다', () => {
    const html = '<a href="https://t.me/+Qwerty1234567">입장</a> @news t.me/news t.me/+abc';
    expect(extractTmeInvitesFromText(html)).toEqual(['+Qwerty1234567']);
    expect(extractTmeInvitesFromText(null)).toEqual([]);
  });

  it('대기열에 넣을 때 초대 해시는 소문자로 바꾸지 않는다', () => {
    const queue = mergeDiscoveryQueue(
      [],
      [
        { username: '+AbCdEf123456', source: 'invite' },
        { username: '@SomeName', source: 'keyword' },
      ],
      new Set(),
      new Set(),
    );
    expect(queue.map((q) => q.username)).toEqual(['+AbCdEf123456', 'somename']);
  });
});
