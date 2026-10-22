import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintNumberTransformer } from '../common/bigint-transformer';
import { dateTimeColumnType } from '../common/db-types';

export enum ChannelStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}

export enum LinkType {
  CHANNEL = 'channel',
  GROUP = 'group',
}

export type ChannelCollectStatus =
  | 'ok'
  | 'failed'
  | 'gone'
  | 'private'
  | 'invalid'
  | 'invite_only'
  | 'merged';

export type ChannelClassifiedKind = 'channel' | 'group' | 'invalid';

export type ChannelListGrade = 'S' | 'A' | 'B' | 'C' | 'D';

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 512 })
  link: string;

  @Column({
    name: 'link_type',
    type: 'varchar',
    length: 20,
    default: LinkType.CHANNEL,
  })
  linkType: LinkType;

  @Column({ length: 100 })
  category: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'recommend_count', default: 0 })
  recommendCount: number;

  @Column({ type: 'varchar', length: 20, default: ChannelStatus.PENDING })
  status: ChannelStatus;

  @Column({ name: 'is_promoted', default: false })
  isPromoted: boolean;

  @Column({
    name: 'promoted_until',
    type: dateTimeColumnType(),
    nullable: true,
  })
  promotedUntil: Date | null;

  @Column({
    name: 'promotion_client_telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  promotionClientTelegramId: number | null;

  @Column({
    name: 'promotion_client_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  promotionClientName: string | null;

  @Column({ name: 'promotion_ton_amount', type: 'real', nullable: true })
  promotionTonAmount: number | null;

  @Column({ name: 'promotion_sort_order', type: 'integer', default: 0 })
  promotionSortOrder: number;

  @Column({
    name: 'submitted_by',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  submittedBy: number | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 1024, nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'avatar_approved', default: false })
  avatarApproved: boolean;

  @Column({ name: 'member_count', type: 'integer', nullable: true })
  memberCount: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({
    name: 'telegram_chat_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  telegramChatId: number | null;

  @Column({
    name: 'first_observed_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  firstObservedAt: Date | null;

  @Column({
    name: 'last_collected_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  lastCollectedAt: Date | null;

  @Column({
    name: 'collect_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  collectStatus: ChannelCollectStatus | null;

  @Column({
    name: 'collect_error',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  collectError: string | null;

  @Column({
    name: 'classified_kind',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  classifiedKind: ChannelClassifiedKind | null;

  @Column({
    name: 'classified_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  classifiedAt: Date | null;

  @Column({ name: 'collect_fail_count', type: 'integer', default: 0 })
  collectFailCount: number;

  /** 목록용 최신 점수 캐시 */
  @Column({ type: 'integer', nullable: true })
  score: number | null;

  @Column({ type: 'varchar', length: 1, nullable: true })
  grade: ChannelListGrade | null;

  @Column({ name: 'view_rate', type: 'real', nullable: true })
  viewRate: number | null;

  @Column({ name: 'growth_24h', type: 'real', nullable: true })
  growth24h: number | null;

  @Column({ name: 'growth_7d', type: 'real', nullable: true })
  growth7d: number | null;

  @Column({ name: 'growth_30d', type: 'real', nullable: true })
  growth30d: number | null;

  @Column({ name: 'median_views_7d', type: 'integer', nullable: true })
  medianViews7d: number | null;

  @Column({ name: 'posts_7d', type: 'integer', nullable: true })
  posts7d: number | null;

  @Column({ name: 'observed_days', type: 'integer', nullable: true })
  observedDays: number | null;

  /** 봇으로 확인한 채널/그룹 운영자 인증 */
  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_at', type: dateTimeColumnType(), nullable: true })
  verifiedAt: Date | null;

  @Column({
    name: 'verified_owner_telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  verifiedOwnerTelegramId: number | null;

  /** Reporter reward: TON amount paid */
  @Column({ name: 'reward_ton_amount', type: 'real', nullable: true })
  rewardTonAmount: number | null;

  /** USD value at payment time (TON amount × rate) */
  @Column({ name: 'reward_usd_amount', type: 'real', nullable: true })
  rewardUsdAmount: number | null;

  /** TON/USD rate used when reward was paid */
  @Column({ name: 'reward_ton_usd_rate', type: 'real', nullable: true })
  rewardTonUsdRate: number | null;

  @Column({
    name: 'reward_paid_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  rewardPaidAt: Date | null;

  @Column({
    name: 'reward_wallet',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  rewardWallet: string | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
