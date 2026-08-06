import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  bigintNumberTransformer,
} from '../common/bigint-transformer';

export enum ChannelStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}

export enum LinkType {
  CHANNEL = 'channel',
  GROUP = 'group',
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 512 })
  link: string;

  @Column({ name: 'link_type', type: 'varchar', length: 20, default: LinkType.CHANNEL })
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

  @Column({ name: 'promoted_until', type: 'timestamptz', nullable: true })
  promotedUntil: Date | null;

  @Column({
    name: 'promotion_client_telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  promotionClientTelegramId: number | null;

  @Column({ name: 'promotion_client_name', type: 'varchar', length: 100, nullable: true })
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

  /** Reporter reward: TON amount paid */
  @Column({ name: 'reward_ton_amount', type: 'real', nullable: true })
  rewardTonAmount: number | null;

  /** USD value at payment time (TON amount × rate) */
  @Column({ name: 'reward_usd_amount', type: 'real', nullable: true })
  rewardUsdAmount: number | null;

  /** TON/USD rate used when reward was paid */
  @Column({ name: 'reward_ton_usd_rate', type: 'real', nullable: true })
  rewardTonUsdRate: number | null;

  @Column({ name: 'reward_paid_at', type: 'timestamptz', nullable: true })
  rewardPaidAt: Date | null;

  @Column({ name: 'reward_wallet', type: 'varchar', length: 128, nullable: true })
  rewardWallet: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}