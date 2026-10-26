import { buildAdminDashboard } from '../admin/admin-dashboard.logic';
import {
  allowAdultInList,
  isPendingCategory,
} from '../channels/auto-expose.logic';
import { isVisibleOnPublicLists } from '../channels/channel-language.logic';
import { dedupeChannelsByLink } from '../channels/channel-link.logic';
import { shouldHideIllegalSuspicion } from '../channels/illegal-content.logic';
import { isPublicCollectable } from './collect-visibility';
import {
  buildMemberRankingCounts,
  MEMBER_PAGE_REASON_ORDER,
  summarizeMemberVisibility,
  type MemberPageRow,
} from './member-page-count.logic';

const OBSERVED = new Date('2026-10-20T00:00:00+09:00');
const CREATED = new Date('2026-10-24T09:00:00+09:00');

type Row = MemberPageRow & { link: string; createdAt: Date; linkType: string };

let seq = 0;
function row(overrides: Partial<Row> = {}): Row {
  seq += 1;
  return {
    link: `https://t.me/channel_${seq}`,
    linkType: 'channel',
    status: 'active',
    isVisible: true,
    firstObservedAt: OBSERVED,
    collectStatus: 'ok',
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
    avatarApproved: false,
    updatedAt: CREATED,
    createdAt: CREATED,
    ...overrides,
  };
}

/** 회원 목록(getRankingCounts·랭킹·피드)이 쓰는 필터 체인을 그대로 옮긴 기준 구현 */
function referenceMemberTotal(rows: Row[]): number {
  const active = rows.filter((r) => r.status === 'active');
  const listable = (c: Row) =>
    isPublicCollectable(c as never) &&
    isVisibleOnPublicLists(c) &&
    !shouldHideIllegalSuspicion(c) &&
    allowAdultInList(c.category) &&
    !isPendingCategory(c.category);
  // 같은 링크는 노출 가능한 행을 먼저 대표로 고른 뒤, 노출 가능한 것만 센다
  return dedupeChannelsByLink(active, { prefer: listable }).filter(listable)
    .length;
}

function sampleChannels(): Row[] {
  return [
    row(),
    row({ category: '게임' }),
    // 같은 링크(대소문자·끝 슬래시만 다름) 두 개: 대표 1개만 회원 화면에 나온다
    row({ link: 'https://t.me/Same_Link', recommendCount: 5 }),
    row({ link: 'https://t.me/same_link/', recommendCount: 1 }),
    // 대표 후보가 숨김(외국어)이어도 같은 링크에 노출 가능한 행이 있으면 그 행이 대표가 된다
    row({
      link: 'https://t.me/dup_hidden',
      language: 'foreign',
      recommendCount: 9,
    }),
    row({ link: 'https://t.me/dup_hidden/', recommendCount: 1 }),
    row({ title: '마약 정보방' }),
    row({
      title: '자유홍보방',
      description: '홍보 가능, 마약 음식 아님 사기꾼 차단 마약 금지',
    }),
    row({ title: '마약김밥 맛집', category: '맛집' }),
    row({ title: '정보방', description: '필로폰 후기 공유' }),
    row({ title: '마약 정보', illegalCleared: true }),
    row({ category: '성인' }),
    row({ category: '분류대기' }),
    row({ language: 'foreign' }),
    row({ language: 'foreign', isPromoted: true }),
    row({ isVisible: false }),
    row({ status: 'pending' }),
    row({ firstObservedAt: null, collectStatus: null }),
    row({ collectStatus: 'gone' }),
    row({ collectStatus: 'invalid' }),
    row({ collectStatus: 'merged' }),
    row({ collectStatus: 'invite_expired' }),
    row({ collectStatus: 'invite_only', firstObservedAt: null }),
    row({ linkType: 'group', category: '커뮤니티' }),
  ];
}

describe('member-page-count.logic', () => {
  it('숨김 이유 목록에 불법 의심 줄이 0건이어도 남는다', () => {
    const summary = summarizeMemberVisibility([row()]);
    expect(summary.hiddenReasons['불법 의심(관리자 확인)']).toBe(0);
    for (const reason of MEMBER_PAGE_REASON_ORDER) {
      expect(summary.hiddenReasons).toHaveProperty([reason]);
    }
    expect(
      Object.keys(summary.hiddenReasons).slice(
        0,
        MEMBER_PAGE_REASON_ORDER.length,
      ),
    ).toEqual([...MEMBER_PAGE_REASON_ORDER]);
  });

  it('불법 의심은 제목 마약·강한 단어만 숨기고 음식·규칙 문구·풀기 처리는 노출한다', () => {
    const rows = [
      row({ title: '마약 정보방' }),
      row({ title: '정보방', description: '필로폰 후기 공유' }),
      row({ title: '마약김밥 맛집' }),
      row({ title: '자유홍보방', description: '마약, 음란물 금지, 추방' }),
      row({ title: '마약 정보', illegalCleared: true }),
    ];
    const summary = summarizeMemberVisibility(rows);
    expect(summary.hiddenReasons['불법 의심(관리자 확인)']).toBe(2);
    expect(summary.visible).toBe(3);
  });

  it('같은 링크는 행 기준 노출에는 둘 다 세고, 회원 "전체"에서는 1개로 센다', () => {
    const rows = [
      row({ link: 'https://t.me/Same_Link', recommendCount: 5 }),
      row({ link: 'https://t.me/same_link/', recommendCount: 1 }),
    ];
    const summary = summarizeMemberVisibility(rows);
    expect(summary.visible).toBe(2);
    expect(summary.duplicateExcess).toBe(1);
    expect(summary.listTotal).toBe(1);
  });

  it('대시보드 노출 수 = 회원 목록 계산 (같은 데이터)', () => {
    const rows = sampleChannels();
    const dashboard = buildAdminDashboard(rows, CREATED);
    const memberCounts = buildMemberRankingCounts(
      rows.filter((r) => r.status === 'active'),
    );
    const reference = referenceMemberTotal(rows);

    // 회원 "전체" 숫자 = 대시보드 노출 − 같은 링크 중복
    expect(memberCounts.all).toBe(reference);
    expect(dashboard.memberListTotal).toBe(reference);
    expect(dashboard.memberVisible - dashboard.memberDuplicateExcess).toBe(
      reference,
    );
    expect(dashboard.memberVisible + dashboard.memberHidden).toBe(rows.length);
    expect(
      Object.values(dashboard.hiddenReasons).reduce((a, b) => a + b, 0),
    ).toBe(dashboard.memberHidden);
  });

  it('회원 카테고리별 개수는 불법 의심·분류대기를 빼고 성인 칩만 따로 센다', () => {
    const rows = [
      row({ category: '뉴스' }),
      row({ category: '뉴스', title: '마약 정보방' }),
      row({ category: '분류대기' }),
      row({ category: '성인' }),
    ];
    const counts = buildMemberRankingCounts(rows);
    expect(counts.all).toBe(1);
    expect(counts['뉴스']).toBe(1);
    expect(counts['성인']).toBe(1);
    expect(counts['분류대기']).toBeUndefined();
  });
});
