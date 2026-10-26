import { ChannelStatus } from '../channels/channel.entity';
import { selectSitemapEntries } from '../seo/sitemap-select.logic';
import {
  isMemberVisible,
  pickBestMemberRow,
  selectMemberVisibleRows,
} from './member-visible.logic';
import { isWeeklyHeadlineChannel } from './weekly-headlines.logic';

const OBSERVED = new Date('2026-10-20T00:00:00+09:00');

let seq = 0;
function ch(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `c${seq}`,
    link: `https://t.me/channel_${seq}`,
    username: `channel_${seq}`,
    status: ChannelStatus.ACTIVE,
    isVisible: true,
    firstObservedAt: OBSERVED,
    collectStatus: 'ok' as const,
    language: 'ko',
    isPromoted: false,
    autoRegistered: false,
    submittedBy: null,
    category: '뉴스',
    title: `정상 채널 ${seq}`,
    description: '소개글',
    illegalCleared: false,
    recommendCount: 0,
    memberCount: 100,
    ...overrides,
  };
}

/** 회원 화면에 나오면 안 되는 채널 모음 */
function hiddenSamples() {
  return {
    adult: ch({ category: '성인' }),
    pendingCategory: ch({ category: '분류대기' }),
    foreign: ch({ language: 'foreign' }),
    gone: ch({ collectStatus: 'gone' }),
    merged: ch({ collectStatus: 'merged' }),
    illegal: ch({ title: '마약 정보방' }),
  };
}

describe('회원 노출 규칙 통일', () => {
  it('회원 검색(selectMemberVisibleRows)은 숨김 사유 채널을 모두 뺀다', () => {
    const ok = ch();
    const hidden = Object.values(hiddenSamples());
    const rows = selectMemberVisibleRows([ok, ...hidden]);
    expect(rows.map((r) => r.id)).toEqual([ok.id]);
  });

  it('성인 카테고리를 직접 고른 검색에서만 성인 채널이 나온다', () => {
    const adult = ch({ category: '성인' });
    expect(selectMemberVisibleRows([adult])).toHaveLength(0);
    expect(selectMemberVisibleRows([adult], '성인')).toHaveLength(1);
    expect(isMemberVisible(adult, '성인')).toBe(true);
    // 다른 숨김 사유는 성인을 골라도 풀리지 않는다
    expect(
      isMemberVisible(ch({ category: '성인', language: 'foreign' }), '성인'),
    ).toBe(false);
  });

  it('같은 링크는 노출 가능한 행이 대표가 된다(추천 수가 더 높은 숨김 행보다 우선)', () => {
    const hiddenBetter = ch({
      id: 'hidden',
      link: 'https://t.me/Same_Link',
      language: 'foreign',
      recommendCount: 50,
    });
    const visible = ch({
      id: 'visible',
      link: 'https://t.me/same_link/',
      recommendCount: 1,
    });
    const rows = selectMemberVisibleRows([hiddenBetter, visible]);
    expect(rows.map((r) => r.id)).toEqual(['visible']);
  });

  it('상세 페이지용 대표는 노출 가능한 행 → 가장 좋은 행 순서다', () => {
    const pendingLike = ch({
      id: 'a',
      category: '분류대기',
      memberCount: 9999,
    });
    const visibleSmall = ch({ id: 'b', memberCount: 10 });
    const visibleBig = ch({ id: 'c', memberCount: 500 });
    expect(pickBestMemberRow([pendingLike, visibleSmall, visibleBig])?.id).toBe(
      'c',
    );
    // 노출 가능한 행이 없어도 하나는 돌려준다
    expect(pickBestMemberRow([pendingLike])?.id).toBe('a');
    expect(pickBestMemberRow([])).toBeNull();
  });

  it('주간 헤드라인도 같은 규칙을 쓴다', () => {
    const samples = hiddenSamples();
    for (const sample of Object.values(samples)) {
      expect(isWeeklyHeadlineChannel(sample as never)).toBe(false);
    }
    expect(isWeeklyHeadlineChannel(ch() as never)).toBe(true);
  });
});

describe('사이트맵 선택', () => {
  it('성인·분류대기·외국어·사라짐·합쳐짐·불법 의심 채널은 뺀다', () => {
    const ok = ch({ username: 'ok_channel' });
    const samples = hiddenSamples();
    const entries = selectSitemapEntries([
      ...Object.values(samples),
      ok,
    ] as never[]);
    expect(entries.map((e) => e.handle)).toEqual(['ok_channel']);
  });

  it('같은 링크는 1개만, username 오름차순으로 낸다', () => {
    const entries = selectSitemapEntries([
      ch({ link: 'https://t.me/Zeta_ch', username: 'Zeta_ch' }),
      ch({ link: 'https://t.me/zeta_ch/', username: 'zeta_ch' }),
      ch({ link: 'https://t.me/alpha_ch', username: 'alpha_ch' }),
    ] as never[]);
    expect(entries.map((e) => e.handle)).toEqual(['alpha_ch', 'zeta_ch']);
  });

  it('username 이 없는 행은 넣지 않는다', () => {
    expect(
      selectSitemapEntries([
        ch({ username: null }),
        ch({ username: '  ' }),
      ] as never[]),
    ).toHaveLength(0);
  });
});
