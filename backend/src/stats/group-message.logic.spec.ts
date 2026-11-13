import {
  shouldCheckInviteGroup,
  summarizeGroupMessages,
  toGroupMessageRow,
} from './group-message.logic';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const sec = (msAgo: number) => Math.floor((NOW - msAgo) / 1000);
const H = 60 * 60 * 1000;

const msg = (id: number, extra: Record<string, unknown> = {}) => ({
  className: 'Message',
  id,
  date: sec(H),
  message: `안녕 ${id}`,
  fromId: { className: 'PeerUser', userId: 1000 + id },
  ...extra,
});

describe('group-message.logic', () => {
  it('본문은 개인정보 가리고, 보낸 사람은 결과에 없음', () => {
    const row = toGroupMessageRow(msg(1, { message: '연락 010-1234-5678' }));
    expect(row?.text).toBe('연락 010●●●');
    expect(row).not.toHaveProperty('fromId');
    expect(JSON.stringify(row)).not.toContain('1001');
  });

  it('서비스 메시지·빈 글은 버리고, 사진만 있는 글은 남김', () => {
    expect(toGroupMessageRow({ className: 'MessageService', id: 2, date: sec(H) })).toBeNull();
    expect(toGroupMessageRow(msg(3, { message: '' }))).toBeNull();
    const photo = toGroupMessageRow(
      msg(4, { message: '', media: { className: 'MessageMediaPhoto' } }),
    );
    expect(photo).toMatchObject({ text: null, mediaType: 'photo' });
  });

  it('운영자 글(익명 운영자·채널) / 고정 글 표시', () => {
    expect(toGroupMessageRow(msg(5, { fromId: { className: 'PeerChannel', channelId: 9 } }))?.isAdminPost).toBe(true);
    expect(toGroupMessageRow(msg(6, { post: true }))?.isAdminPost).toBe(true);
    expect(toGroupMessageRow(msg(7))?.isAdminPost).toBe(false);
    expect(toGroupMessageRow(msg(8, { pinned: true }))?.isPinned).toBe(true);
    expect(toGroupMessageRow(msg(9), 9)?.isPinned).toBe(true);
  });

  it('최근 7일 참여자 수(같은 사람은 한 번), 최신순 정렬', () => {
    const { rows, activeSenders7d } = summarizeGroupMessages(
      [
        msg(10, { fromId: { className: 'PeerUser', userId: 1 } }),
        msg(12, { fromId: { className: 'PeerUser', userId: 1 } }),
        msg(11, { fromId: { className: 'PeerUser', userId: 2 } }),
        msg(13, { date: sec(8 * 24 * H), fromId: { className: 'PeerUser', userId: 3 } }),
        msg(14, { fromId: { className: 'PeerChannel', channelId: 5 } }),
      ],
      { nowMs: NOW },
    );
    expect(activeSenders7d).toBe(2);
    expect(rows.map((r) => r.messageId)).toEqual([14, 13, 12, 11, 10]);
  });

  it('긴 글은 1000자에서 자름', () => {
    const row = toGroupMessageRow(msg(20, { message: '가'.repeat(1500) }));
    expect([...(row?.text ?? '')].length).toBe(1000);
  });

  it('비공개 그룹 초대 링크 확인: 요청함 표시했거나 어드민이 직접 누를 때만', () => {
    expect(shouldCheckInviteGroup({ joinRequestedAt: null })).toBe(false);
    expect(shouldCheckInviteGroup({ joinRequestedAt: new Date() })).toBe(true);
    expect(shouldCheckInviteGroup({ joinRequestedAt: null }, { manual: true })).toBe(true);
  });
});
