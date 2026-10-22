import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** 채널 일일 관측 스냅샷 (날짜는 KST YYYY-MM-DD) */
@Entity('channel_snapshots')
@Unique('uq_channel_snapshots_channel_captured', ['channelId', 'capturedOn'])
@Index('idx_channel_snapshots_channel', ['channelId'])
export class ChannelSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'captured_on', type: 'varchar', length: 10 })
  capturedOn: string;

  @Column({ name: 'member_count', type: 'integer', default: 0 })
  memberCount: number;

  @Column({ name: 'median_views_7d', type: 'integer', default: 0 })
  medianViews7d: number;

  @Column({ name: 'posts_7d', type: 'integer', default: 0 })
  posts7d: number;

  @Column({ name: 'forwarded_ratio', type: 'real', default: 0 })
  forwardedRatio: number;

  /** 그룹 활동량: 최근 24시간 메시지 수. 채널은 0 */
  @Column({ name: 'activity_24h', type: 'integer', default: 0 })
  activity24h: number;

  /** 그룹 활동량: 최근 7일 메시지 수. 채널은 0 */
  @Column({ name: 'activity_7d', type: 'integer', default: 0 })
  activity7d: number;
}
