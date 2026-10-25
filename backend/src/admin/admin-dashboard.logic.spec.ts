import {
  buildAdminDashboard,
  sqlBoolLiterals,
  visibilityReasonSql,
} from './admin-dashboard.logic';

describe('buildAdminDashboard', () => {
  it('유형·노출·등록 경로를 집계한다', () => {
    const now = new Date('2026-10-24T12:00:00+09:00');
    const data = buildAdminDashboard(
      [
        {
          linkType: 'channel',
          status: 'active',
          isVisible: true,
          firstObservedAt: now,
          collectStatus: 'ok',
          language: 'ko',
          autoRegistered: true,
          submittedBy: null,
          category: '뉴스',
          createdAt: now,
        },
        {
          linkType: 'group',
          status: 'pending',
          isVisible: true,
          firstObservedAt: null,
          collectStatus: null,
          language: 'unknown',
          autoRegistered: false,
          submittedBy: 1,
          category: '커뮤니티',
          createdAt: now,
        },
      ],
      now,
    );
    expect(data.channelCount).toBe(1);
    expect(data.groupCount).toBe(1);
    expect(data.memberVisible).toBe(1);
    expect(data.memberHidden).toBe(1);
    expect(data.hiddenReasons['승인되지 않음']).toBe(1);
    expect(data.pendingCount).toBe(1);
    expect(data.registered.today.auto).toBe(1);
    expect(data.registered.today.report).toBe(1);
    expect(data.categories[0].count).toBe(1);
  });

  it('숨김 이유 SQL 이 회원 페이지 이유 키를 모두 담는다', () => {
    const sql = visibilityReasonSql('channel', sqlBoolLiterals('better-sqlite3'));
    for (const reason of [
      '승인되지 않음',
      '관리자가 숨김',
      '아직 수집되지 않음',
      '채널·그룹 아님',
      '사라진 채널',
      '합쳐진 채널',
      '초대 만료',
      '외국어',
      '불법 의심(관리자 확인)',
      '분류대기',
      '성인 카테고리',
    ]) {
      expect(sql).toContain(reason);
    }
    expect(sqlBoolLiterals('postgres')).toEqual({ t: 'TRUE', f: 'FALSE' });
  });
});
