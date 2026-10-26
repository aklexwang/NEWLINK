import {
  isBannerLive,
  kstDateBoundary,
  normalizeBannerLink,
  parseRotateSeconds,
  sniffImageMime,
} from './ad-banner.logic';

describe('ad-banner.logic', () => {
  it('넘김 간격은 정해진 값만', () => {
    expect(parseRotateSeconds('5')).toBe(5);
    expect(parseRotateSeconds(4)).toBe(3);
    expect(parseRotateSeconds(undefined)).toBe(3);
  });

  it('기간·켜짐으로 노출 판단', () => {
    const now = new Date('2026-10-26T06:00:00Z');
    expect(
      isBannerLive({ isActive: true, startsAt: null, endsAt: null }, now),
    ).toBe(true);
    expect(
      isBannerLive({ isActive: false, startsAt: null, endsAt: null }, now),
    ).toBe(false);
    expect(
      isBannerLive(
        {
          isActive: true,
          startsAt: new Date('2026-10-27T00:00:00Z'),
          endsAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isBannerLive(
        {
          isActive: true,
          startsAt: null,
          endsAt: new Date('2026-10-26T05:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('텔레그램 링크만', () => {
    expect(normalizeBannerLink('t.me/axpay')).toBe('https://t.me/axpay');
    expect(normalizeBannerLink('@axpay')).toBe('https://t.me/axpay');
    expect(normalizeBannerLink('https://t.me/+AbC123')).toBe(
      'https://t.me/+AbC123',
    );
    expect(normalizeBannerLink('https://evil.com/x')).toBeNull();
    expect(normalizeBannerLink('https://t.me/')).toBeNull();
  });

  it('이미지 종류는 파일 앞부분으로', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffImageMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(sniffImageMime(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('날짜는 KST 하루 경계', () => {
    expect(kstDateBoundary('2026-11-30', false)?.toISOString()).toBe(
      '2026-11-29T15:00:00.000Z',
    );
    expect(kstDateBoundary('2026-11-30', true)?.toISOString()).toBe(
      '2026-11-30T15:00:00.000Z',
    );
    expect(kstDateBoundary('', false)).toBeNull();
  });
});
