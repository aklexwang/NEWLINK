import {
  classifyTelegramAccountHtml,
  clipCollectError,
  extractTmeUsernamesFromHtml,
  formatBotCollectError,
  isMissingChannelHtml,
  isPlaceholderTitle,
  isPrivateChannelHtml,
  parseCount,
  parseTelegramChannelHtml,
} from './telegram-preview-html';

describe('parseCount', () => {
  it('K·M 접미사를 정수로 변환한다', () => {
    expect(parseCount('1.2K')).toBe(1200);
    expect(parseCount('3.4M')).toBe(3_400_000);
    expect(parseCount('1.5B')).toBe(1_500_000_000);
    expect(parseCount('12.34K')).toBe(12340);
  });

  it('쉼표·공백이 있는 숫자를 처리한다', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('1 234')).toBe(1234);
    expect(parseCount('  56 ')).toBe(56);
  });

  it('빈 값은 null이다', () => {
    expect(parseCount(null)).toBeNull();
    expect(parseCount('')).toBeNull();
    expect(parseCount('   ')).toBeNull();
  });
});

const SAMPLE_HTML = `
<div class="tgme_channel_info">
  <div class="tgme_channel_info_header_title"><span>뉴스채널</span></div>
  <div class="tgme_channel_info_counters">
    <div class="tgme_channel_info_counter">
      <span class="counter_value">1.2K</span>
      <span class="counter_type">subscribers</span>
    </div>
    <div class="tgme_channel_info_counter">
      <span class="counter_value">80</span>
      <span class="counter_type">photos</span>
    </div>
  </div>
</div>
<div class="tgme_widget_message" data-post="news_kr/101">
  <time datetime="2026-10-18T03:00:00+00:00"></time>
  <span class="tgme_widget_message_views">3.4M</span>
  <a class="tgme_widget_message_forwarded_from_name" href="https://t.me/source_ch/9">출처</a>
  <div class="tgme_widget_message_photo_wrap"></div>
  <span class="tgme_widget_message_edited">edited</span>
  <div class="tgme_widget_message_text">
    <a href="https://t.me/good_news/12">글</a>
    <a href="https://t.me/+invitehash">초대</a>
    <a href="https://t.me/joinchat/AAAA">조인</a>
    <a href="https://t.me/s">미리보기</a>
    <a href="https://t.me/helper_bot">봇</a>
    <a href="https://t.me/news_kr/5">자기자신</a>
  </div>
</div>
<div class="tgme_widget_message" data-post="news_kr/100">
  <time datetime="2026-10-17T01:00:00+00:00"></time>
  <span class="tgme_widget_message_views">88</span>
  <div class="tgme_widget_message_video_wrap"><video></video></div>
</div>
<div class="tgme_widget_message" data-post="news_kr/99">
  <time datetime="2026-10-16T01:00:00+00:00"></time>
  <a class="tgme_widget_message_document" href="#"></a>
</div>
`;

describe('parseTelegramChannelHtml', () => {
  const parsed = parseTelegramChannelHtml(SAMPLE_HTML);

  it('제목과 구독자 수를 읽는다', () => {
    expect(parsed.title).toBe('뉴스채널');
    expect(parsed.memberCount).toBe(1200);
    expect(parsed.hasPreview).toBe(true);
    expect(parsed.usernameFromPosts).toBe('news_kr');
  });

  it('게시글 messageId·조회수·전달·수정·미디어를 파싱한다', () => {
    expect(parsed.posts).toHaveLength(3);

    const photo = parsed.posts.find((p) => p.messageId === 101);
    expect(photo?.views).toBe(3_400_000);
    expect(photo?.forwardedFrom).toBe('https://t.me/source_ch/9');
    expect(photo?.isEdited).toBe(true);
    expect(photo?.mediaType).toBe('photo');
    expect(photo?.postedAt.toISOString()).toBe('2026-10-18T03:00:00.000Z');
    expect(photo?.mentionedUsernames).toEqual(['source_ch', 'good_news']);
    expect(photo?.textExcerpt).toContain('글');

    const video = parsed.posts.find((p) => p.messageId === 100);
    expect(video?.views).toBe(88);
    expect(video?.forwardedFrom).toBeNull();
    expect(video?.isEdited).toBe(false);
    expect(video?.mediaType).toBe('video');

    const file = parsed.posts.find((p) => p.messageId === 99);
    expect(file?.mediaType).toBe('file');
    expect(file?.views).toBeNull();
  });

  it('그룹 members 카운터도 읽는다', () => {
    const html = `
      <div class="tgme_channel_info">
        <div class="tgme_channel_info_header_title">모임</div>
        <div class="tgme_channel_info_counter">
          <span class="counter_value">45</span>
          <span class="counter_type">members</span>
        </div>
      </div>`;
    expect(parseTelegramChannelHtml(html).memberCount).toBe(45);
  });
});

describe('extractTmeUsernamesFromHtml', () => {
  it('글 링크에서 아이디만 남기고 초대·s·봇·자기 자신은 뺀다', () => {
    const html = `
      <a href="https://t.me/alpha/99">a</a>
      <a href="https://t.me/+xxxx">inv</a>
      <a href="https://t.me/joinchat/yyyy">j</a>
      <a href="https://t.me/s">s</a>
      <a href="https://t.me/s/beta">preview user</a>
      <a href="https://t.me/MyHelperBot">bot</a>
      <a href="https://t.me/selfchan/1">self</a>
      텍스트 https://t.me/gamma
    `;
    expect(extractTmeUsernamesFromHtml(html, 'selfchan')).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });
});

describe('채널 상태 HTML', () => {
  it('존재하지 않는 채널 문구를 감지한다', () => {
    expect(
      isMissingChannelHtml("Sorry, this channel doesn't seem to exist."),
    ).toBe(true);
    expect(isMissingChannelHtml('뉴스채널')).toBe(false);
  });

  it('비공개 채널 문구를 감지한다', () => {
    expect(isPrivateChannelHtml('This channel is private')).toBe(true);
    expect(isPrivateChannelHtml('공개 채널')).toBe(false);
  });
});

describe('t.me 계정 종류 판별', () => {
  it('subscribers 는 채널이다', () => {
    const html = `
      <div class="tgme_page_title"><span>뉴스채널</span></div>
      <div class="tgme_page_extra">12 345 subscribers</div>`;
    expect(classifyTelegramAccountHtml(html)).toMatchObject({
      kind: 'channel',
      reason: 'page:subscribers',
      title: '뉴스채널',
    });
  });

  it('members·online 은 그룹이다', () => {
    const html = `
      <div class="tgme_page_title"><span>소통방</span></div>
      <div class="tgme_page_extra">1 869 members, 12 online</div>`;
    expect(classifyTelegramAccountHtml(html)).toMatchObject({
      kind: 'group',
      reason: 'page:members',
      title: '소통방',
    });
  });

  it('봇 시작 버튼은 invalid 이다', () => {
    const html = `
      <div class="tgme_page_title"><span>Wallet</span></div>
      <a class="tgme_action_button">Start Bot</a>`;
    expect(classifyTelegramAccountHtml(html).kind).toBe('invalid');
    expect(classifyTelegramAccountHtml(html).reason).toBe('page:bot');
  });

  it('개인 프로필 Send Message 는 invalid 이다', () => {
    const html = `
      <div class="tgme_page_title"><span>홍길동</span></div>
      <a class="tgme_action_button">Send Message</a>`;
    expect(classifyTelegramAccountHtml(html)).toMatchObject({
      kind: 'invalid',
      reason: 'page:user',
    });
  });

  it('없는 아이디는 invalid 이다', () => {
    expect(
      classifyTelegramAccountHtml("Sorry, this channel doesn't seem to exist."),
    ).toMatchObject({ kind: 'invalid', reason: 'page:not_found' });
  });
});

describe('플레이스홀더 제목·수집 오류 문구', () => {
  it('텔레그램 기본 문구 제목을 감지한다', () => {
    expect(isPlaceholderTitle('Telegram: Contact @bloter_news')).toBe(true);
    expect(isPlaceholderTitle('View @bugun_sport')).toBe(true);
    expect(isPlaceholderTitle('Launch @wallet')).toBe(true);
    expect(isPlaceholderTitle('Telegram: Join Group Chat')).toBe(true);
    expect(isPlaceholderTitle('블랙리스트소통방')).toBe(false);
  });

  it('Bot API 오류를 error_code와 description으로 남긴다', () => {
    expect(formatBotCollectError(400, 'Bad Request: chat not found')).toBe(
      'bot:400:Bad Request: chat not found',
    );
    expect(formatBotCollectError(429, 'Too Many Requests: retry after 12')).toBe(
      'bot:429:Too Many Requests: retry after 12',
    );
  });

  it('collect_error 는 255자를 넘기지 않는다', () => {
    expect(clipCollectError('a'.repeat(300)).length).toBe(255);
  });
});
