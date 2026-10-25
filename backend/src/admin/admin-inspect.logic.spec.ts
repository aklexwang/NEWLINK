import {
  applyMissingTitleResult,
  assertRegisterManySize,
  classifyAdminInspectPage,
  inspectItemResultCaption,
  interruptRunningInspectJobs,
  parseAdminInspectLines,
  parseOneInspectLine,
  suggestInspectCategory,
} from './admin-inspect.logic';

describe('어드민 링크 미리보기 분류', () => {
  it('t.me·@아이디·아이디만 받고 중복 줄을 뺀다', () => {
    const lines = parseAdminInspectLines(
      'https://t.me/NewsKorea\n@NewsKorea\nnewskorea\nhttps://t.me/+AbCdEf\n\n!!!bad!!!\n',
    );
    expect(lines.map((row) => row.username ?? row.link)).toEqual([
      'newskorea',
      'https://t.me/+AbCdEf',
      null,
    ]);
    expect(lines[2].result).toBe('invalid_format');
    expect(parseOneInspectLine('@hello_world').link).toBe(
      'https://t.me/hello_world',
    );
  });

  it('없는 채널·비공개·외국어·100명 미만·정상을 가른다', () => {
    expect(
      classifyAdminInspectPage({
        html: null,
        status: 404,
        isInvite: false,
      }).result,
    ).toBe('not_found');
    expect(
      classifyAdminInspectPage({
        html: 'This channel is private',
        status: 200,
        isInvite: false,
      }).result,
    ).toBe('invite_or_private');
    expect(
      classifyAdminInspectPage({
        html: 'This invite link is expired',
        status: 200,
        isInvite: true,
      }).result,
    ).toBe('invite_or_private');

    const foreign = classifyAdminInspectPage({
      html: `<div class="tgme_page_title">English News</div>
        <div class="tgme_page_extra">12 003 subscribers</div>
        <div class="tgme_page_description">breaking news daily</div>`,
      status: 200,
      isInvite: false,
    });
    // 최근 글을 아직 못 봤으면 외국어로 단정하지 않고 "언어 미확인"으로 둔다
    expect(foreign.result).toBe('language_unknown');
    expect(foreign.linkType).toBe('channel');

    const small = classifyAdminInspectPage({
      html: `<div class="tgme_page_title">한국뉴스속보채널</div>
        <div class="tgme_page_extra">12 subscribers</div>
        <div class="tgme_page_description">국내 뉴스 속보를 모읍니다</div>`,
      status: 200,
      isInvite: false,
    });
    expect(small.result).toBe('too_small');

    const ok = classifyAdminInspectPage({
      html: `<div class="tgme_page_title">한국뉴스속보채널</div>
        <div class="tgme_page_extra">1 200 subscribers</div>
        <div class="tgme_page_description">국내 뉴스 속보를 모읍니다</div>`,
      status: 200,
      isInvite: false,
    });
    expect(ok.result).toBe('ok');
    expect(ok.memberCount).toBe(1200);
    expect(ok.linkType).toBe('channel');
    expect(ok.description).toBe('국내 뉴스 속보를 모읍니다');
  });

  it('초대 링크 extra 가 subscribers 이면 채널로 본다', () => {
    const invite = classifyAdminInspectPage({
      html: `<div class="tgme_page_title">한국뉴스채널</div>
        <div class="tgme_page_extra">2 000 subscribers</div>
        <div class="tgme_page_description">국내 뉴스</div>`,
      status: 200,
      isInvite: true,
      finalUrl: 'https://t.me/+ChannelInvite',
    });
    expect(invite.linkType).toBe('channel');
    expect(invite.result).toBe('ok');
  });

  it('초대 링크는 그룹으로 보고 제목·소개·인원·사진을 읽는다', () => {
    const invite = classifyAdminInspectPage({
      html: `<div class="tgme_page">
        <div class="tgme_page_photo"><img src="https://cdn4.telegram-cdn.org/file/abc.jpg"></div>
        <div class="tgme_page_title">테더천국 장외거래 소통방</div>
        <div class="tgme_page_extra">558 members</div>
        <div class="tgme_page_description">장외 소통</div>
      </div>
      <meta property="og:image" content="https://cdn4.telegram-cdn.org/file/abc.jpg">`,
      status: 200,
      isInvite: true,
      finalUrl: 'https://t.me/+uI8tNLAF57MzMThk',
    });
    expect(invite.result).toBe('ok');
    expect(invite.linkType).toBe('group');
    expect(invite.title).toBe('테더천국 장외거래 소통방');
    expect(invite.memberCount).toBe(558);
    expect(invite.description).toBe('장외 소통');
    expect(invite.avatarUrl).toContain('telegram-cdn.org');
  });

  it('공개 그룹은 members 로 그룹을 판별한다', () => {
    const group = classifyAdminInspectPage({
      html: `<div class="tgme_page_title">한국뉴스속보그룹</div>
        <div class="tgme_page_extra">1 200 members</div>
        <div class="tgme_page_description">국내 뉴스 속보를 모읍니다</div>`,
      status: 200,
      isInvite: false,
    });
    expect(group.result).toBe('ok');
    expect(group.linkType).toBe('group');
    expect(group.title).toBe('한국뉴스속보그룹');
  });

  it('제목이 없으면 없는 방으로 본다', () => {
    expect(
      applyMissingTitleResult({
        result: 'not_korean',
        title: null,
        description: null,
        avatarUrl: null,
        memberCount: null,
        linkType: 'group',
        language: 'en',
      }).result,
    ).toBe('not_found');
  });

  it('실행 중 job 은 interrupted 로 바꾼다', () => {
    const now = new Date('2026-10-24T12:00:00.000Z');
    const next = interruptRunningInspectJobs(
      [
        { id: 'a', status: 'running', finishedAt: null },
        { id: 'b', status: 'completed', finishedAt: now },
      ],
      now,
    );
    expect(next).toEqual([
      {
        id: 'a',
        status: 'interrupted',
        endedReason: 'interrupted',
        finishedAt: now,
      },
    ]);
  });

  it('등록됨을 이미 등록됨과 이번에 등록함으로 나눈다', () => {
    expect(
      inspectItemResultCaption({
        result: 'already_registered',
        registeredThisJob: false,
        memberVisible: true,
        memberReason: '',
      }),
    ).toBe('이미 등록됨 · 노출 중');
    expect(
      inspectItemResultCaption({
        result: 'already_registered',
        registeredThisJob: false,
        memberVisible: false,
        memberReason: '외국어',
      }),
    ).toBe('이미 등록됨 · 숨김(외국어)');
    expect(
      inspectItemResultCaption({
        result: 'ok',
        registeredThisJob: true,
        memberVisible: true,
        memberReason: '',
      }),
    ).toBe('이번에 등록함');
  });

  it('선택 등록은 최대 100개다', () => {
    expect(assertRegisterManySize(['a', 'a', 'b'])).toEqual(['a', 'b']);
    expect(() =>
      assertRegisterManySize(Array.from({ length: 101 }, (_, i) => `id-${i}`)),
    ).toThrow(/최대 100개/);
  });
});

describe('단건 등록 카테고리 추천', () => {
  it('제목·소개가 뚜렷하면 키워드 추천 카테고리를 돌려준다', () => {
    expect(
      suggestInspectCategory('한국 뉴스 속보 채널', '오늘의 뉴스 속보와 정치 소식'),
    ).toBe('뉴스');
    expect(suggestInspectCategory('카지노 토토 사이트', '카지노 베팅')).toBe('카지노');
  });

  it('근거가 약하면 분류대기를 돌려준다', () => {
    expect(suggestInspectCategory('소통방', '')).toBe('분류대기');
    expect(suggestInspectCategory(null, null)).toBe('분류대기');
  });
});
