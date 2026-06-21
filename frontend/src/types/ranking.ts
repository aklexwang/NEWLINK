import type { LinkType } from './channel';

export interface RankingChannel {
  id: string;
  title: string;
  username: string | null;
  link: string;
  avatarUrl: string | null;
  participantsCount: number;
  recommendCount: number;
  category: string;
  linkType: LinkType;
  source?: 'telegram' | 'tgstat';
}

export interface RankingCategoryItem {
  id: string;
  name: string;
  emoji: string;
  count: number;
}

export interface RankingStatus {
  source: 'telegram' | 'tgstat';
  label: string;
  hint?: string;
}
