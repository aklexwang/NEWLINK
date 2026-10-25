import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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
  | 'invite_expired'
  | 'merged';

export type ChannelClassifiedKind = 'channel' | 'group' | 'invalid';

export type ChannelListGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type ChannelLanguage = 'ko' | 'foreign' | 'unknown';

export type ChannelCollectTier = 'daily' | 'weekly';

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

  /** MTProto InputChannel 용. 로그·공개 API에 넣지 않음 */
  @Column({
    name: 'telegram_access_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  telegramAccessHash: string | null;

  /**
   * 연결된 대화방(채널 행) 또는 부모 채널(그룹 행)의 텔레그램 id. -100 을 뗀 양수.
   * MTProto GetFullChannel 의 linkedChatId 로 채운다.
   */
  @Column({
    name: 'linked_chat_telegram_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintNumberTransformer,
  })
  linkedChatTelegramId: number | null;

  @Column({ name: 'linked_chat_title', type: 'varchar', length: 255, nullable: true })
  linkedChatTitle: string | null;

  @Column({ name: 'linked_chat_username', type: 'varchar', length: 64, nullable: true })
  linkedChatUsername: string | null;

  @Column({ name: 'linked_chat_created_on', type: dateTimeColumnType(), nullable: true })
  linkedChatCreatedOn: Date | null;

  /** 텔레그램 채널·그룹 개설일 (공개 정보) */
  @Column({ name: 'created_on', type: dateTimeColumnType(), nullable: true })
  createdOn: Date | null;

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

  @Column({
    type: 'varchar',
    length: 10,
    default: 'unknown',
  })
  language: ChannelLanguage;

  /** 그룹 언어 판별용 한글 비율. 본문은 저장하지 않음 */
  @Column({ name: 'language_hangul_ratio', type: 'real', nullable: true })
  languageHangulRatio: number | null;

  /** 관리자가 수동으로 정한 언어. 자동 판별이 덮어쓰지 않음 */
  @Column({ name: 'language_locked', default: false })
  languageLocked: boolean;

  /** 공개 목록 노출. false 여도 수집은 계속한다 */
  @Column({ name: 'is_visible', default: true })
  isVisible: boolean;

  /** 관리자가 카테고리를 고정하면 자동 분류가 덮어쓰지 않음 */
  @Column({ name: 'category_locked', default: false })
  categoryLocked: boolean;

  /** 관리자가 불법 의심을 문제없음으로 풀었는지 */
  @Column({ name: 'illegal_cleared', default: false })
  illegalCleared: boolean;

  @Column({
    name: 'illegal_cleared_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  illegalClearedAt: Date | null;

  /** 제목 고정. true 면 수집이 제목을 덮어쓰지 않음(소개글은 계속 갱신) */
  @Column({ name: 'title_locked', default: false })
  titleLocked: boolean;

  @Column({ name: 'category_confidence', type: 'real', nullable: true })
  categoryConfidence: number | null;

  /** 조건 통과로 승인 없이 등록됨 */
  @Column({ name: 'auto_registered', default: false })
  autoRegistered: boolean;

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

  /** 회원 증감 수(명). 일별 기록끼리 뺀 값이라 증가율에서 되돌린 값보다 정확하다 */
  @Column({ name: 'member_delta_24h', type: 'integer', nullable: true })
  memberDelta24h: number | null;

  @Column({ name: 'member_delta_7d', type: 'integer', nullable: true })
  memberDelta7d: number | null;

  @Column({ name: 'member_delta_30d', type: 'integer', nullable: true })
  memberDelta30d: number | null;

  @Column({ name: 'median_views_7d', type: 'integer', nullable: true })
  medianViews7d: number | null;

  @Column({ name: 'posts_7d', type: 'integer', nullable: true })
  posts7d: number | null;

  /**
   * 다음 수집 예정 시각. NULL 이면 바로 대상. 수집 성공·실패 때마다 갱신한다.
   * 우선순위 큐(light·full 공통)가 이 칸으로 대상을 뽑는다.
   */
  @Index('IDX_channels_next_collect_at')
  @Column({
    name: 'next_collect_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  nextCollectAt: Date | null;

  /**
   * 글을 못 찾음(not_found)이 이어진 횟수. 3회면 gone.
   * collect_fail_count 는 모든 실패를 세어 재시도 간격(1·2·4배)에 쓰므로 gone 판단은 이 칸으로 따로 센다.
   */
  @Column({ name: 'collect_gone_count', type: 'integer', default: 0 })
  collectGoneCount: number;

  /**
   * (사용 중단) 예전 daily/weekly 요일 버킷. next_collect_at 큐로 대체되어 더 이상 읽거나 쓰지 않는다.
   * 칸은 호환을 위해 남겨 둔다.
   */
  @Column({
    name: 'collect_tier',
    type: 'varchar',
    length: 16,
    default: 'weekly',
  })
  collectTier: ChannelCollectTier;

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

  /** 회원 제보만 pending. 기본은 지급 대상 아님. */
  @Column({
    name: 'payout_status',
    type: 'varchar',
    length: 20,
    default: 'not_eligible',
  })
  payoutStatus: 'not_eligible' | 'pending' | 'paid' | 'skipped';

  @Column({
    name: 'payout_skip_reason',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  payoutSkipReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
