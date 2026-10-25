import { applyCollectedTitle, isTitleLocked } from './title-lock.logic';

describe('title-lock.logic', () => {
  it('고정이 아니면 새 제목으로 바꾸고 true 를 돌려준다', () => {
    const channel = { title: '옛 제목', titleLocked: false };
    expect(applyCollectedTitle(channel, '  새 제목 ')).toBe(true);
    expect(channel.title).toBe('새 제목');
  });

  it('고정이면 제목을 덮어쓰지 않는다', () => {
    const channel = { title: '관리자 제목', titleLocked: true };
    expect(isTitleLocked(channel)).toBe(true);
    expect(applyCollectedTitle(channel, '텔레그램 제목')).toBe(false);
    expect(channel.title).toBe('관리자 제목');
  });

  it('빈 제목이나 같은 제목은 바꾸지 않는다', () => {
    const channel = { title: '같은 제목', titleLocked: false };
    expect(applyCollectedTitle(channel, null)).toBe(false);
    expect(applyCollectedTitle(channel, '   ')).toBe(false);
    expect(applyCollectedTitle(channel, '같은 제목')).toBe(false);
    expect(channel.title).toBe('같은 제목');
  });

  it('titleLocked 가 없는 옛 행은 고정이 아닌 것으로 본다', () => {
    expect(isTitleLocked({ titleLocked: undefined })).toBe(false);
    expect(isTitleLocked({ titleLocked: null })).toBe(false);
  });
});
