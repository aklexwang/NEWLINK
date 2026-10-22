import {
  allowAdultInList,
  AUTO_EXPOSE_MIN_MEMBERS,
  canAutoExpose,
  CATEGORY_CONFIDENCE_MIN,
  isChannelListed,
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from './auto-expose.logic';

describe('canAutoExpose', () => {
  const ok = {
    kind: 'channel' as const,
    language: 'ko' as const,
    memberCount: 120,
    hasActiveUsername: false,
  };

  it('한국어·100명 이상·중복 없는 채널은 통과한다', () => {
    expect(canAutoExpose(ok)).toEqual({ ok: true, reason: 'ok' });
    expect(AUTO_EXPOSE_MIN_MEMBERS).toBe(100);
  });

  it('invalid 이거나 한국어가 아니거나 인원이 부족하거나 username 이 있으면 막는다', () => {
    expect(canAutoExpose({ ...ok, kind: 'invalid' }).ok).toBe(false);
    expect(canAutoExpose({ ...ok, language: 'unknown' }).reason).toBe(
      'language',
    );
    expect(canAutoExpose({ ...ok, memberCount: 99 }).reason).toBe('members');
    expect(canAutoExpose({ ...ok, memberCount: null }).ok).toBe(false);
    expect(canAutoExpose({ ...ok, hasActiveUsername: true }).reason).toBe(
      'duplicate_username',
    );
  });
});

describe('resolveCategoryWithConfidence', () => {
  it('기준값 미만이면 분류대기이다', () => {
    expect(CATEGORY_CONFIDENCE_MIN).toBe(0.7);
    expect(resolveCategoryWithConfidence('뉴스', 0.69)).toEqual({
      category: PENDING_CATEGORY,
      pending: true,
    });
    expect(resolveCategoryWithConfidence('뉴스', 0.7)).toEqual({
      category: '뉴스',
      pending: false,
    });
  });
});

describe('공개 목록 제외', () => {
  it('is_visible=false 는 목록에서 뺀다', () => {
    expect(isChannelListed({ isVisible: true })).toBe(true);
    expect(isChannelListed({})).toBe(true);
    expect(isChannelListed({ isVisible: false })).toBe(false);
  });

  it('성인은 해당 카테고리를 고를 때만 남긴다', () => {
    expect(allowAdultInList('뉴스')).toBe(true);
    expect(allowAdultInList('성인')).toBe(false);
    expect(allowAdultInList('성인', '성인')).toBe(true);
    expect(allowAdultInList('성인', 'all')).toBe(false);
  });
});
