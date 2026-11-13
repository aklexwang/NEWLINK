import { groupSameRoomCandidates } from './join-candidate-group.logic';

const row = (id: string, title: string, memberCount: number | null) => ({
  id,
  title,
  link: `https://t.me/+${id}`,
  category: null,
  memberCount,
});

describe('groupSameRoomCandidates (같은 방 추정 묶기)', () => {
  it('같은 이름 + 회원 수 비슷하면 한 장으로(四神 8개 → 1개)', () => {
    const rows = [21258, 21255, 21255, 21255, 21254, 21254, 21254, 21254].map(
      (m, i) => row(`s${i}`, '四神', m),
    );
    const groups = groupSameRoomCandidates(rows, [], 200);
    expect(groups).toHaveLength(1);
    expect(groups[0].linkCount).toBe(8);
    expect(groups[0].memberCount).toBe(21258); // 대표 = 회원 가장 많은 링크
    expect(groups[0].id).toBe('s0');
  });

  it('이름 공백·대소문자 차이는 같은 이름으로 본다', () => {
    const groups = groupSameRoomCandidates(
      [row('a', '악 인 [ 惡 人 ]', 11768), row('b', '악인[惡人]', 11761)],
      [],
      200,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].linkCount).toBe(2);
  });

  it('수집 시점이 달라 3% 안쪽으로 다른 숫자도 같은 방(무소유 9,817 ~ 9,668)', () => {
    const groups = groupSameRoomCandidates(
      [9817, 9817, 9702, 9699, 9668].map((m, i) => row(`m${i}`, '무소유', m)),
      [],
      200,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].linkCount).toBe(5);
  });

  it('이름이 같아도 회원 수가 크게 다르면 다른 방', () => {
    const groups = groupSameRoomCandidates(
      [row('x', '홍보방', 5000), row('y', '홍보방', 800)],
      [],
      200,
    );
    expect(groups).toHaveLength(2);
  });

  it('이름이 다르면 회원 수가 같아도 다른 방', () => {
    const groups = groupSameRoomCandidates(
      [row('x', '악인', 3898), row('y', '악인 소통방', 3898)],
      [],
      200,
    );
    expect(groups).toHaveLength(2);
  });

  it('같은 방이 이미 요청함/승인 상태면 묶음 전체를 뺀다', () => {
    const groups = groupSameRoomCandidates(
      [row('a', '四神', 21258), row('b', '四神', 21254), row('c', '다른방', 100)],
      [{ title: '四神', memberCount: 21255 }],
      200,
    );
    expect(groups.map((g) => g.title)).toEqual(['다른방']);
  });

  it('회원 수 많은 순으로, limit 개까지', () => {
    const groups = groupSameRoomCandidates(
      [row('a', 'A', 100), row('b', 'B', 300), row('c', 'C', 200)],
      [],
      2,
    );
    expect(groups.map((g) => g.title)).toEqual(['B', 'C']);
  });
});
