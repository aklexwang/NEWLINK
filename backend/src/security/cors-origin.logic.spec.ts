import {
  DEFAULT_CORS_ORIGINS,
  isCorsOriginAllowed,
  parseCorsOrigins,
} from './cors-origin.logic';

describe('CORS 출처 허용', () => {
  const list = parseCorsOrigins(undefined);

  it('회원 사이트·커스텀 도메인은 허용', () => {
    for (const o of DEFAULT_CORS_ORIGINS) {
      expect(isCorsOriginAllowed(o, list)).toBe(true);
    }
  });

  it('미리보기 배포(<해시>.newlink-bez.pages.dev)는 허용', () => {
    expect(isCorsOriginAllowed('https://91469667.newlink-bez.pages.dev', list)).toBe(true);
    expect(isCorsOriginAllowed('https://review-1026k.newlink-bez.pages.dev', list)).toBe(true);
  });

  it('Origin 헤더가 없으면(서버 간 호출·헬스체크) 통과', () => {
    expect(isCorsOriginAllowed(undefined, list)).toBe(true);
  });

  it('모르는 사이트는 거부', () => {
    expect(isCorsOriginAllowed('https://evil.example', list)).toBe(false);
    expect(isCorsOriginAllowed('https://newlink-bez.pages.dev.evil.com', list)).toBe(false);
    expect(isCorsOriginAllowed('http://newlink-bez.pages.dev', list)).toBe(false);
  });

  it('CORS_ORIGINS 환경변수로 추가 허용', () => {
    const l = parseCorsOrigins('https://extra.example, https://two.example');
    expect(isCorsOriginAllowed('https://extra.example', l)).toBe(true);
    expect(isCorsOriginAllowed('https://two.example', l)).toBe(true);
  });
});
