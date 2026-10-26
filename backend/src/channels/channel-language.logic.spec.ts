import {
  detectChannelLanguage,
  detectChannelLanguageResult,
  detectGroupLanguageFromStoredRatio,
  foreignReasonLabel,
  hangulRatio,
  isDefaultPublicLanguage,
  isAdminDirectRegistered,
  isVisibleOnPublicLists,
  LANGUAGE_MIN_LETTERS,
  LANGUAGE_MIN_POST_EXCERPTS,
} from './channel-language.logic';
import { isKoreanChannelText } from '../auto-manage/korean-channel.filter';

describe('detectChannelLanguage', () => {
  it('한글 제목·설명은 ko 이다', () => {
    expect(
      detectChannelLanguage({
        title: '매일 뉴스 요약',
        description: '오늘 경제 소식입니다',
      }),
    ).toBe('ko');
  });

  it('저장한 한글 비율이 낮으면 그룹을 foreign 으로 본다', () => {
    expect(
      detectGroupLanguageFromStoredRatio({
        title: 'Crypto.com',
        description: 'Official group',
        hangulRatio: 0.01,
      }),
    ).toBe('foreign');
    expect(
      detectGroupLanguageFromStoredRatio({
        title: 'Crypto.com',
        description: 'Official group',
        hangulRatio: null,
      }),
    ).toBe('unknown');
  });

  it('그룹처럼 게시글 본문을 빼면 제목·소개만으로 판별한다', () => {
    const withPosts = detectChannelLanguage({
      title: 'Daily Club',
      description: 'chat room for members',
      excerpts: [
        '안녕하세요 오늘 날씨 좋네요',
        '저녁에 같이 이야기해요',
        '한국어로 수다 떠는 방입니다',
        '서울 소식 공유합니다',
        '주말 모임 어떠세요',
      ],
    });
    const groupLike = detectChannelLanguage({
      title: 'Daily Club',
      description: 'chat room for members',
    });
    expect(withPosts).toBe('ko');
    expect(groupLike).not.toBe('ko');
  });

  it('영문 제목·설명만 있으면 본문 없이 foreign 하지 않는다', () => {
    expect(
      detectChannelLanguage({
        title: 'Pavel Durov',
        description: 'Telegram News and updates from the founder',
      }),
    ).toBe('unknown');
    expect(
      detectChannelLanguage({
        title: 'Telegram News',
        description: 'Official updates here',
      }),
    ).toBe('unknown');
  });

  it('제목·설명에 키릴 문자가 뚜렷하면 본문 없이 foreign 이다', () => {
    const result = detectChannelLanguageResult({
      title: 'Новости канала',
      description: 'Сегодня важные события в мире',
    });
    expect(result.language).toBe('foreign');
    expect(result.reason).toBe('cyrillic');
    expect(foreignReasonLabel(result.reason)).toBe('키릴문자');
  });

  it('게시글 본문이 5개 미만이면 영문도 unknown 이다', () => {
    expect(LANGUAGE_MIN_POST_EXCERPTS).toBe(5);
    expect(
      detectChannelLanguage({
        title: 'Daily Brief',
        description: 'Market news',
        excerpts: [
          'Hello world update',
          'More english text here',
          'Third post',
        ],
      }),
    ).toBe('unknown');
  });

  it('영문 게시글 본문이 충분하면 foreign 이다', () => {
    const excerpts = [
      'Today the market opened higher after overnight gains.',
      'Investors are watching the dollar and oil prices closely.',
      'The company released a longer update for subscribers.',
      'Another post about weekend events and tickets.',
      'Final note about the upcoming conference schedule.',
    ];
    const result = detectChannelLanguageResult({
      title: 'Daily Brief',
      description: 'Market news',
      excerpts,
    });
    expect(result.language).toBe('foreign');
    expect(result.reason).toBe('posts');
    expect(foreignReasonLabel(result.reason)).toBe('게시글본문');
  });

  it('글자가 너무 적으면 unknown 이다', () => {
    expect(detectChannelLanguage({ title: 'AXPAY' })).toBe('unknown');
    expect(LANGUAGE_MIN_LETTERS).toBeGreaterThan(5);
  });

  it('제목은 영어여도 한글 게시글이 많으면 ko 이다', () => {
    expect(
      detectChannelLanguage({
        title: 'Daily Brief',
        description: '',
        excerpts: [
          '오늘 오전 증시가 크게 올랐습니다. 환율도 함께 움직였습니다.',
          '내일 일정은 국회 본회의입니다.',
        ],
      }),
    ).toBe('ko');
  });

  it('빈 값은 unknown 이다', () => {
    expect(detectChannelLanguage({})).toBe('unknown');
    expect(detectChannelLanguage({ title: '', description: null })).toBe(
      'unknown',
    );
  });
});

describe('hangulRatio', () => {
  it('한글만 있으면 1에 가깝다', () => {
    expect(hangulRatio('안녕하세요 뉴스입니다')).toBeGreaterThan(0.8);
  });

  it('영어만 있으면 0이다', () => {
    expect(hangulRatio('Hello Telegram News')).toBe(0);
  });
});

describe('isDefaultPublicLanguage', () => {
  it('ko 와 unknown 만 기본 공개에 넣는다', () => {
    expect(isDefaultPublicLanguage('ko')).toBe(true);
    expect(isDefaultPublicLanguage('unknown')).toBe(true);
    expect(isDefaultPublicLanguage(null)).toBe(true);
    expect(isDefaultPublicLanguage('foreign')).toBe(false);
  });
});

describe('isVisibleOnPublicLists', () => {
  it('광고 채널은 외국어여도 숨기지 않는다', () => {
    expect(
      isVisibleOnPublicLists({ language: 'foreign', isPromoted: true }),
    ).toBe(true);
    expect(
      isVisibleOnPublicLists({ language: 'foreign', isPromoted: false }),
    ).toBe(false);
  });

  it('비활성 채널은 광고여도 공개 목록에서 뺀다', () => {
    expect(
      isVisibleOnPublicLists({
        language: 'ko',
        isPromoted: true,
        isVisible: false,
      }),
    ).toBe(false);
  });

  it('어드민이 직접 등록한 미확인 언어는 숨기지 않는다', () => {
    expect(
      isAdminDirectRegistered({ autoRegistered: false, submittedBy: null }),
    ).toBe(true);
    expect(
      isVisibleOnPublicLists({
        language: 'unknown',
        isPromoted: false,
        autoRegistered: false,
        submittedBy: null,
      }),
    ).toBe(true);
  });
});

describe('isKoreanChannelText 기준 맞춤', () => {
  it('한글이 있으면 후보 필터도 통과한다', () => {
    expect(isKoreanChannelText('뉴스채널', '설명')).toBe(true);
    expect(
      detectChannelLanguage({
        title: '뉴스채널',
        description: '설명입니다 오늘',
      }),
    ).toBe('ko');
  });

  it('한글이 없으면 후보 필터도 막는다', () => {
    expect(isKoreanChannelText('Telegram News', 'Official updates')).toBe(
      false,
    );
  });
});
