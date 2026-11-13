import { MASK, maskPersonalInfo } from './pii-mask.logic';

describe('maskPersonalInfo (그룹 대화 개인정보 가림)', () => {
  it('휴대폰 번호(여러 표기)', () => {
    expect(maskPersonalInfo('연락 010-1234-5678 주세요')).toBe(`연락 010${MASK} 주세요`);
    expect(maskPersonalInfo('01012345678')).toBe(`010${MASK}`);
    expect(maskPersonalInfo('010 1234 5678')).toBe(`010${MASK}`);
    expect(maskPersonalInfo('+82 10-1234-5678')).toBe(`821${MASK}`);
  });

  it('계좌번호·주민번호', () => {
    expect(maskPersonalInfo('국민 123456-78-901234 홍길동')).toBe(`국민 123${MASK} 홍길동`);
    expect(maskPersonalInfo('900101-1234567')).toBe(`900${MASK}`);
  });

  it('금액·날짜·시각은 그대로', () => {
    expect(maskPersonalInfo('1,000,000원 입금')).toBe('1,000,000원 입금');
    expect(maskPersonalInfo('2026.11.13 21:30')).toBe('2026.11.13 21:30');
    expect(maskPersonalInfo('3만원 50%')).toBe('3만원 50%');
  });

  it('이메일', () => {
    expect(maskPersonalInfo('메일 abc.def@naver.com 로')).toBe(`메일 ${MASK}@${MASK} 로`);
  });

  it('@아이디는 가리고 t.me 링크는 그대로', () => {
    expect(maskPersonalInfo('문의는 @hong_gildong 으로')).toBe(`문의는 @${MASK} 으로`);
    expect(maskPersonalInfo('https://t.me/somechannel 들어오세요')).toBe(
      'https://t.me/somechannel 들어오세요',
    );
    expect(maskPersonalInfo('https://t.me/+AbCdEf123')).toBe('https://t.me/+AbCdEf123');
  });

  it('메신저 아이디', () => {
    expect(maskPersonalInfo('카톡 abc1234')).toBe(`카톡 ${MASK}`);
    expect(maskPersonalInfo('카톡아이디: hong12')).toBe(`카톡아이디: ${MASK}`);
    expect(maskPersonalInfo('kakao: hong12')).toBe(`kakao: ${MASK}`);
    // 콜론 없는 영어 문장은 건드리지 않음
    expect(maskPersonalInfo('line up here')).toBe('line up here');
  });

  it('빈 값', () => {
    expect(maskPersonalInfo(null)).toBe('');
    expect(maskPersonalInfo('')).toBe('');
  });
});
