/**
 * 홍보 이미지 자동 그리기(브라우저 캔버스 → JPG). 1200×630(텔레그램 미리보기 비율).
 * 스타일·문구를 바꿔 여러 장 만들어 돌려 쓴다(같은 이미지 반복은 스팸처럼 보임).
 */

export type PromoImageStyle = 'bright' | 'night' | 'gold' | 'mint';

export const PROMO_IMAGE_STYLES: { id: PromoImageStyle; label: string }[] = [
  { id: 'bright', label: '밝은 하늘' },
  { id: 'night', label: '나이트 블루' },
  { id: 'gold', label: '블랙 골드' },
  { id: 'mint', label: '민트' },
];

const W = 1200;
const H = 630;
const FONT = `'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;

type Palette = {
  bg: [string, string, string];
  title: string;
  brand: [string, string];
  sub: string;
  chipBg: string;
  chipText: string;
  ctaBg: [string, string];
  ctaText: string;
  dot: string;
};

const PALETTES: Record<PromoImageStyle, Palette> = {
  bright: {
    bg: ['#ffffff', '#e8f4ff', '#bfe0ff'],
    title: '#0f2a4a',
    brand: ['#1683e6', '#22b5f0'],
    sub: '#3d5a7a',
    chipBg: '#ffffff',
    chipText: '#1673c9',
    ctaBg: ['#ffb92e', '#ff8a1f'],
    ctaText: '#ffffff',
    dot: 'rgba(34,154,240,0.18)',
  },
  night: {
    bg: ['#070d1c', '#0e1f3d', '#13305e'],
    title: '#ffffff',
    brand: ['#38c6f4', '#2aabee'],
    sub: '#a9c2e6',
    chipBg: 'rgba(255,255,255,0.10)',
    chipText: '#cfe6ff',
    ctaBg: ['#2aabee', '#1683e6'],
    ctaText: '#ffffff',
    dot: 'rgba(56,198,244,0.20)',
  },
  gold: {
    bg: ['#0b0b0f', '#15151c', '#1d1a12'],
    title: '#f6e7c1',
    brand: ['#f5d27a', '#d9a441'],
    sub: '#c9b98f',
    chipBg: 'rgba(245,210,122,0.10)',
    chipText: '#f5d27a',
    ctaBg: ['#f5d27a', '#d9a441'],
    ctaText: '#1a1406',
    dot: 'rgba(245,210,122,0.16)',
  },
  mint: {
    bg: ['#f7fffb', '#dcf8ee', '#b9efdc'],
    title: '#0b3b2e',
    brand: ['#12b886', '#0ca678'],
    sub: '#2f6b58',
    chipBg: '#ffffff',
    chipText: '#0ca678',
    ctaBg: ['#12b886', '#0b9c70'],
    ctaText: '#ffffff',
    dot: 'rgba(18,184,134,0.18)',
  },
};

/** 이미지 큰 글씨 후보(줄바꿈 \n) */
export function promoHeadlines(rooms: number): string[] {
  const r = rooms >= 1000 ? `${(Math.floor(rooms / 100) * 100).toLocaleString('ko-KR')}개+` : `${rooms}개`;
  return [
    '텔레그램 방 찾기,\n이제 TellLink',
    rooms >= 100 ? `채널·그룹 ${r}\n한 번에 검색` : '텔레그램 채널·그룹\n한 번에 검색',
    '요즘 뜨는 텔레그램 방\n랭킹으로 한눈에',
    '내 채널·그룹도\n무료로 등록',
    '카테고리별\n텔레그램 방 모음',
  ];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderPromoImage(opts: {
  style: PromoImageStyle;
  headline: string;
  sub: string;
  chips: string[];
  cta: string;
}): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const p = PALETTES[opts.style];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 쓸 수 없어요.');

  // 배경
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.bg[0]);
  bg.addColorStop(0.5, p.bg[1]);
  bg.addColorStop(1, p.bg[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 점 무늬(오른쪽)
  ctx.fillStyle = p.dot;
  for (let x = 640; x < W; x += 28) {
    for (let y = 20; y < H; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 큰 원
  const glow = ctx.createRadialGradient(1010, 150, 10, 1010, 150, 320);
  glow.addColorStop(0, p.dot.replace(/0\.\d+\)/, '0.55)'));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 텔레그램 종이비행기 원
  ctx.save();
  ctx.translate(980, 300);
  const plane = ctx.createLinearGradient(-110, -110, 110, 110);
  plane.addColorStop(0, p.brand[1]);
  plane.addColorStop(1, p.brand[0]);
  ctx.fillStyle = plane;
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-58, -4);
  ctx.lineTo(62, -52);
  ctx.lineTo(40, 60);
  ctx.lineTo(8, 30);
  ctx.lineTo(-10, 54);
  ctx.lineTo(-14, 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 로고 글씨
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillStyle = p.title;
  ctx.fillText('Tell', 80, 110);
  const tellW = ctx.measureText('Tell').width;
  const brandGrad = ctx.createLinearGradient(80 + tellW, 0, 80 + tellW + 90, 0);
  brandGrad.addColorStop(0, p.brand[0]);
  brandGrad.addColorStop(1, p.brand[1]);
  ctx.fillStyle = brandGrad;
  ctx.fillText('Link', 80 + tellW, 110);

  // 큰 글씨(최대 2줄, 넓이에 맞춰 크기 조절)
  const lines = opts.headline.split('\n').slice(0, 2);
  let size = 78;
  ctx.font = `900 ${size}px ${FONT}`;
  while (size > 44 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > 640) {
    size -= 4;
    ctx.font = `900 ${size}px ${FONT}`;
  }
  ctx.fillStyle = p.title;
  lines.forEach((line, i) => ctx.fillText(line, 80, 220 + i * (size + 14)));
  const afterTitle = 220 + (lines.length - 1) * (size + 14);

  // 작은 글씨
  ctx.font = `500 28px ${FONT}`;
  ctx.fillStyle = p.sub;
  ctx.fillText(opts.sub, 82, afterTitle + 62);

  // 칩
  let cx = 80;
  const cy = afterTitle + 100;
  ctx.font = `700 24px ${FONT}`;
  for (const chip of opts.chips.slice(0, 4)) {
    const w = ctx.measureText(chip).width + 36;
    ctx.fillStyle = p.chipBg;
    roundRect(ctx, cx, cy, w, 46, 14);
    ctx.fill();
    ctx.fillStyle = p.chipText;
    ctx.fillText(chip, cx + 18, cy + 31);
    cx += w + 12;
  }

  // 버튼
  ctx.font = `800 30px ${FONT}`;
  const ctaW = ctx.measureText(opts.cta).width + 80;
  const ctaY = H - 112;
  const ctaGrad = ctx.createLinearGradient(80, 0, 80 + ctaW, 0);
  ctaGrad.addColorStop(0, p.ctaBg[0]);
  ctaGrad.addColorStop(1, p.ctaBg[1]);
  ctx.fillStyle = ctaGrad;
  roundRect(ctx, 80, ctaY, ctaW, 68, 34);
  ctx.fill();
  ctx.fillStyle = p.ctaText;
  ctx.fillText(opts.cta, 112, ctaY + 45);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요.'))), 'image/jpeg', 0.88),
  );
}
