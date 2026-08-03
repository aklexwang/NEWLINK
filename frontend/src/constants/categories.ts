export const CATEGORIES = [
  { id: 'all', label: '전체', emoji: '🔎' },
  { id: '뉴스', label: '뉴스', emoji: '📰' },
  { id: '경제', label: '경제', emoji: '💹' },
  { id: '암호화폐', label: '암호화폐', emoji: '🪙' },
  { id: '쇼핑', label: '쇼핑', emoji: '🛒' },
  { id: '교육', label: '교육', emoji: '📚' },
  { id: '기술', label: '기술', emoji: '💻' },
  { id: '엔터테인먼트', label: '엔터테인먼트', emoji: '🎬' },
  { id: '음악', label: '음악', emoji: '🎵' },
  { id: '게임', label: '게임', emoji: '🎮' },
  { id: '스포츠', label: '스포츠', emoji: '⚽' },
  { id: '커뮤니티', label: '커뮤니티', emoji: '👥' },
  { id: '여행', label: '여행', emoji: '✈️' },
  { id: '맛집', label: '맛집', emoji: '🍽️' },
  { id: '건강', label: '건강', emoji: '💪' },
  { id: '부동산', label: '부동산', emoji: '🏠' },
  { id: '구인구직', label: '구인구직', emoji: '💼' },
  { id: '기타', label: '기타', emoji: '📁' },
] as const;

export const SUBMIT_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.label);
