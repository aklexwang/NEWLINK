import {
  ADMIN_LIST_MAX_PAGE_SIZE,
  classifyRegisterSource,
  clampAdminPage,
  clampAdminPageSize,
  matchesMemberPageFilter,
  paginateItems,
  parseAdminListSort,
  sortAdminListItems,
} from './admin-list.logic';

describe('admin-list.logic', () => {
  it('페이지 크기를 1~200으로 맞춘다', () => {
    expect(clampAdminPageSize(undefined)).toBe(50);
    expect(clampAdminPageSize(0)).toBe(50);
    expect(clampAdminPageSize(200)).toBe(200);
    expect(clampAdminPageSize(999)).toBe(ADMIN_LIST_MAX_PAGE_SIZE);
    expect(clampAdminPage('2')).toBe(2);
    expect(clampAdminPage(-1)).toBe(1);
  });

  it('정렬·등록 경로를 해석한다', () => {
    expect(parseAdminListSort('members_desc')).toBe('members_desc');
    expect(parseAdminListSort('promo_order')).toBe('promo_order');
    expect(parseAdminListSort('nope')).toBe('created_desc');
    expect(classifyRegisterSource({ autoRegistered: true, submittedBy: null })).toBe(
      'auto',
    );
    expect(
      classifyRegisterSource({ autoRegistered: false, submittedBy: 12 }),
    ).toBe('report');
    expect(
      classifyRegisterSource({ autoRegistered: false, submittedBy: null }),
    ).toBe('admin');
  });

  it('회원 페이지 노출 필터와 페이지 나누기를 적용한다', () => {
    const hidden = {
      status: 'active',
      isVisible: true,
      firstObservedAt: null,
      category: '뉴스',
      language: 'ko',
    };
    expect(
      matchesMemberPageFilter(hidden, { memberPage: 'no', hideReason: '아직 수집되지 않음' }),
    ).toBe(true);
    expect(matchesMemberPageFilter(hidden, { memberPage: 'yes' })).toBe(false);

    const sorted = sortAdminListItems(
      [
        { title: '가', createdAt: '2026-01-01', memberCount: 1 },
        { title: '나', createdAt: '2026-02-01', memberCount: 9 },
      ],
      'members_desc',
    );
    expect(sorted[0].title).toBe('나');

    const page = paginateItems([1, 2, 3, 4, 5], 2, 2);
    expect(page).toEqual({ items: [3, 4], total: 5, page: 2, pageSize: 2 });
  });

  it('숨김 이유 필터 후 total과 페이지 수가 일치한다', () => {
    const rows = [
      { status: 'active', isVisible: true, firstObservedAt: null, category: '뉴스', language: 'ko' },
      { status: 'active', isVisible: true, firstObservedAt: null, category: '뉴스', language: 'ko' },
      { status: 'active', isVisible: true, firstObservedAt: null, category: '뉴스', language: 'ko' },
      { status: 'pending', isVisible: true, firstObservedAt: null, category: '뉴스', language: 'ko' },
      {
        status: 'active',
        isVisible: true,
        firstObservedAt: new Date('2026-01-01'),
        collectStatus: 'ok',
        category: '뉴스',
        language: 'ko',
      },
    ];
    const matched = rows.filter((row) =>
      matchesMemberPageFilter(row, {
        memberPage: 'no',
        hideReason: '아직 수집되지 않음',
      }),
    );
    expect(matched).toHaveLength(3);

    const page1 = paginateItems(matched, 1, 2);
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.page).toBe(1);
    expect(Math.ceil(page1.total / page1.pageSize)).toBe(2);

    const page2 = paginateItems(matched, 2, 2);
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
    expect(page2.page).toBe(2);
    expect(Math.ceil(page2.total / page2.pageSize)).toBe(2);
  });
});
