import {
  matchGroupByTitle,
  normalizeChatTitle,
  normalizeTelegramChatId,
  parseLinkedChat,
  pickChatById,
  telegramChatIdVariants,
} from './linked-chat.logic';

describe('연결된 대화방 판별', () => {
  it('봇 형식(-100…)과 MTProto 형식을 같은 id 로 본다', () => {
    expect(normalizeTelegramChatId(-1001234567890)).toBe(1234567890);
    expect(normalizeTelegramChatId('1234567890')).toBe(1234567890);
    expect(normalizeTelegramChatId(BigInt(1234567890))).toBe(1234567890);
    expect(normalizeTelegramChatId(null)).toBeNull();
    expect(normalizeTelegramChatId('abc')).toBeNull();
    expect(telegramChatIdVariants(1234567890)).toEqual([
      1234567890, -1001234567890,
    ]);
  });

  it('GetFullChannel 결과에서 비공개 대화방 정보를 꺼낸다', () => {
    const linked = parseLinkedChat({
      fullChat: { linkedChatId: BigInt(222) },
      chats: [
        { id: 111, title: '테더천국 소식채널', broadcast: true },
        {
          id: 222,
          title: '테더천국 장외거래 소통방',
          megagroup: true,
          date: 1768230000,
        },
      ],
    });
    expect(linked).toEqual({
      telegramChatId: 222,
      title: '테더천국 장외거래 소통방',
      username: null,
      createdOn: new Date(1768230000 * 1000),
      isGroup: true,
    });
  });

  it('연결이 없으면 null, 공개 대화방이면 아이디를 소문자로', () => {
    expect(parseLinkedChat({ fullChat: {}, chats: [] })).toBeNull();
    const linked = parseLinkedChat({
      fullChat: { linkedChatId: 333 },
      chats: [
        { id: 333, title: '공개방', username: 'OpenRoom', megagroup: true },
      ],
    });
    expect(linked?.username).toBe('openroom');
  });

  it('chats[] 순서와 상관없이 요청한 채널을 id 로 고른다', () => {
    const chats = [
      { id: 222, title: '대화방' },
      { id: 111, title: '채널' },
    ];
    expect(pickChatById(chats, 111)?.title).toBe('채널');
    expect(pickChatById(chats, BigInt(111))?.title).toBe('채널');
  });

  it('제목이 똑같은 비공개 그룹이 딱 하나일 때만 연결한다', () => {
    const rows = [
      { id: 'a', title: '⚡테더천국 장외거래 소통방⚡' },
      { id: 'b', title: '다른 방' },
    ];
    expect(matchGroupByTitle(rows, '테더천국 장외거래 소통방')?.id).toBe('a');
    expect(
      matchGroupByTitle(
        [...rows, { id: 'c', title: '테더천국 장외거래소통방' }],
        '테더천국 장외거래 소통방',
      ),
    ).toBeNull();
    expect(matchGroupByTitle(rows, null)).toBeNull();
    expect(normalizeChatTitle(' A b-C ')).toBe('abc');
  });
});
