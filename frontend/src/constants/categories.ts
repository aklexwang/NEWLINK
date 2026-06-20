export const CATEGORIES = [
  { id: 'all', label: '전체', emoji: '🔎' },
  { id: '뉴스', label: '뉴스', emoji: '📰' },
  { id: '커뮤니티', label: '커뮤니티', emoji: '👥' },
  { id: '쇼핑', label: '쇼핑', emoji: '🛒' },
  { id: '교육', label: '교육', emoji: '📚' },
  { id: '엔터테인먼트', label: '엔터테인먼트', emoji: '🎬' },
  { id: '기타', label: '기타', emoji: '📁' },
] as const;

export const SUBMIT_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.label);