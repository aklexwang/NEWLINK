import type { LinkType } from './channel';
import type { ChannelBadge, ChannelGrade } from './stats';

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
  score?: number | null;
  grade?: ChannelGrade | null;
  viewRate?: number | null;
  growth7d?: number | null;
  isVerified?: boolean;
  badges?: ChannelBadge[];
  sparkline14?: (number | null)[];
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
