import {
  abbreviatedCountTolerance,
  resolveMemberCount,
} from './member-count.logic';
import {
  parseExactMemberCountFromPage,
  parsePublicUsernamePage,
  parseTelegramChannelHtml,
} from './telegram-preview-html';

describe('축약 표기의 반올림 오차', () => {
  it('마지막 자리의 절반이다', () => {
    expect(abbreviatedCountTolerance('40.8K')).toBe(50);
    expect(abbreviatedCountTolerance('298K')).toBe(500);
    expect(abbreviatedCountTolerance('1.2K')).toBe(50);
    expect(abbreviatedCountTolerance('9.24M')).toBe(5_000);
    expect(abbreviatedCountTolerance('10.3M')).toBe(50_000);
    expect(abbreviatedCountTolerance('1.5B')).toBe(50_000_000);
  });

  it('숫자 그대로면 오차가 없다', () => {
    expect(abbreviatedCountTolerance('523')).toBe(0);
    expect(abbreviatedCountTolerance('9 243 803')).toBe(0);
    expect(abbreviatedCountTolerance('1,234')).toBe(0);
    expect(abbreviatedCountTolerance(null)).toBe(0);
    expect(abbreviatedCountTolerance('')).toBe(0);
  });
});

describe('정확한 회원 수 우선 규칙 (resolveMemberCount)', () => {
  it('정확한 값이 오면 항상 그 값으로 갱신한다', () => {
    expect(resolveMemberCount({ stored: 40_000, observed: 40_892 })).toBe(40_892);
    expect(
      resolveMemberCount({ stored: 40_892, observed: 40_850, tolerance: 0 }),
    ).toBe(40_850);
  });

  it('축약값이 반올림 오차 안이면 저장된 정확한 값을 지킨다', () => {
    // 40,892 는 실제로 "40.9K" 로 보이지만, 40.9K 가 오면 저장값과 차이 8 ≤ 50
    expect(
      resolveMemberCount({ stored: 40_892, observed: 40_900, tolerance: 50 }),
    ).toBe(40_892);
    // 경계(차이 == 오차)도 같은 값으로 본다
    expect(
      resolveMemberCount({ stored: 40_850, observed: 40_900, tolerance: 50 }),
    ).toBe(40_850);
    expect(
      resolveMemberCount({ stored: 297_720, observed: 298_000, tolerance: 500 }),
    ).toBe(297_720);
  });

  it('오차를 벗어나면 실제로 변한 것이므로 축약값으로 갱신한다', () => {
    expect(
      resolveMemberCount({ stored: 40_892, observed: 41_000, tolerance: 50 }),
    ).toBe(41_000);
    expect(
      resolveMemberCount({ stored: 40_892, observed: 40_700, tolerance: 50 }),
    ).toBe(40_700);
  });

  it('저장된 값이 없으면 축약값이라도 저장한다', () => {
    expect(
      resolveMemberCount({ stored: null, observed: 40_800, tolerance: 50 }),
    ).toBe(40_800);
    expect(
      resolveMemberCount({ stored: undefined, observed: 40_800, tolerance: 50 }),
    ).toBe(40_800);
  });

  it('관측값이 없으면 저장된 값을 그대로 둔다', () => {
    expect(resolveMemberCount({ stored: 1_234, observed: null })).toBe(1_234);
    expect(resolveMemberCount({ stored: null, observed: null })).toBeNull();
  });

  it('축약값끼리 이어져도 흔들리지 않는다', () => {
    // 저장된 값이 이미 축약값(40,800)이면 같은 "40.8K" 가 와도 그대로
    expect(
      resolveMemberCount({ stored: 40_800, observed: 40_800, tolerance: 50 }),
    ).toBe(40_800);
  });
});

describe('페이지에서 읽는 회원 수 (실제 t.me 형식)', () => {
  it('t.me/s 미리보기는 축약값과 오차를 준다', () => {
    const html = `
      <div class="tgme_channel_info">
        <div class="tgme_channel_info_header_title"><span>샘플</span></div>
        <div class="tgme_channel_info_counters">
          <div class="tgme_channel_info_counter"><span class="counter_value">83.4K</span> <span class="counter_type">subscribers</span></div>
          <div class="tgme_channel_info_counter"><span class="counter_value">16</span> <span class="counter_type">photos</span></div>
        </div>
      </div>`;
    const parsed = parseTelegramChannelHtml(html);
    expect(parsed.memberCount).toBe(83_400);
    expect(parsed.memberCountTolerance).toBe(50);
  });

  it('미리보기 숫자가 작으면(1천 미만) 정확한 값이다', () => {
    const html = `
      <div class="tgme_channel_info">
        <div class="tgme_channel_info_counter"><span class="counter_value">523</span> <span class="counter_type">subscribers</span></div>
      </div>`;
    const parsed = parseTelegramChannelHtml(html);
    expect(parsed.memberCount).toBe(523);
    expect(parsed.memberCountTolerance).toBe(0);
  });

  it('회원 수를 못 읽으면 오차는 0', () => {
    const parsed = parseTelegramChannelHtml('<div class="tgme_channel_info"></div>');
    expect(parsed.memberCount).toBeNull();
    expect(parsed.memberCountTolerance).toBe(0);
  });

  it('t.me/<username> 채널 페이지는 축약 없는 정확한 수를 준다', () => {
    const html =
      '<div class="tgme_page_title"><span>샘플</span></div><div class="tgme_page_extra">9 243 803 subscribers</div>';
    expect(parseExactMemberCountFromPage(html)).toBe(9_243_803);
  });

  it('t.me/<username> 그룹 페이지도 정확한 수를 준다 (온라인 수는 따로)', () => {
    const html =
      '<div class="tgme_page_title"><span>그룹</span></div><div class="tgme_page_extra">94 074 members, 4 455 online</div>';
    expect(parseExactMemberCountFromPage(html)).toBe(94_074);
    expect(parsePublicUsernamePage(html)).toMatchObject({
      kind: 'group',
      memberCount: 94_074,
    });
    expect(
      parseExactMemberCountFromPage(
        '<div class="tgme_page_extra">107 members, 2 online</div>',
      ),
    ).toBe(107);
  });

  it('인원 표시가 없으면 null', () => {
    expect(parseExactMemberCountFromPage('<div class="tgme_page_title">x</div>')).toBeNull();
  });
});
