import {
  assertRegisterManySize,
  classifyAdminInspectPage,
  inspectItemResultCaption,
  interruptRunningInspectJobs,
  parseAdminInspectLines,
  parseOneInspectLine,
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
    expect(foreign.result).toBe('not_korean');
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
