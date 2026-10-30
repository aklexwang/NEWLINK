import {
  canSpendForCollect,
  mtprotoSpecialReserve,
} from './mtproto-reserve.logic';

describe('MTProto 예비분', () => {
  it('기본 한도(초대 40·가입 15·검색 20·조회 50)면 예비분 305', () => {
    expect(
      mtprotoSpecialReserve({
        inviteCheckDaily: 40,
        joinDaily: 15,
        keywordSearchDaily: 20,
        resolveDaily: 50,
      }),
    ).toBe(305);
  });

  it('남은 요청이 예비분 이하면 수집은 멈춘다', () => {
    expect(canSpendForCollect(286, 285)).toBe(true);
    expect(canSpendForCollect(285, 285)).toBe(false);
    expect(canSpendForCollect(0, 285)).toBe(false);
  });
});
