/** 텔레그램 게시글 표시용 공용 값 */

export const MEDIA_LABEL: Record<string, string> = {
  photo: '사진 포함',
  video: '영상 포함',
  document: '파일 포함',
  audio: '음성 포함',
  poll: '투표',
  sticker: '스티커',
};

export const MEDIA_ONLY_LABEL: Record<string, string> = {
  photo: '사진 게시글',
  video: '영상 게시글',
  document: '파일 게시글',
  audio: '음성 게시글',
  poll: '투표 게시글',
  sticker: '스티커',
};

export function isIosDevice(webApp: { platform?: string }): boolean {
  try {
    if (webApp.platform === 'ios') return true;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /iPhone|iPad|iPod/i.test(ua);
  } catch {
    return false;
  }
}

export const TG_PATH =
  'M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z';
