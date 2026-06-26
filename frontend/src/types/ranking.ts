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
  source?: 'database' | 'telegram' | 'tgstat';
}

export interface RankingCategoryItem {
  id: string;
  name: string;
  emoji: string;
  iconUrl?: string | null;
  count: number;
}

export interface RankingStatus {
  source: 'database' | 'tgstat';
  label: string;
  hint?: string;
}
