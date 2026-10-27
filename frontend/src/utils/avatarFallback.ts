/** 텔레그램처럼: 사진 없는 방은 이름 머리글자 + 색 동그라미 */

const GRADIENTS = [
  ['#ff885e', '#ff516a'], // 빨강
  ['#ffcd6a', '#ffa85c'], // 주황
  ['#82b1ff', '#665fff'], // 보라
  ['#a0de7e', '#54cb68'], // 초록
  ['#53edd6', '#28c9b7'], // 청록
  ['#72d5fd', '#2a9ef1'], // 파랑
  ['#e0a2f3', '#d669ed'], // 분홍
] as const;

/** "[삼성/조현렬] 정유/화학 Newsfeed" → "삼N" (첫 낱말 + 마지막 낱말 첫 글자) */
export function avatarInitials(title: string): string {
  const words = title
    .replace(/[[\](){}<>【】「」『』"'`~!@#$%^&*_=+|\\:;,.?/·•-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function avatarGradient(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(180deg, ${a}, ${b})`;
}

/** 텔레그램 userpic 은 사진이 없으면 빈(아주 작은) 그림을 준다 → 실패로 본다 */
export function isBlankAvatarImage(img: HTMLImageElement): boolean {
  return img.naturalWidth <= 2 || img.naturalHeight <= 2;
}
