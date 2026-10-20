import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

export type ChannelEventType =
  | 'first_seen'
  | 'title_changed'
  | 'username_changed'
  | 'rank_up'
  | 'gone'
  | 'returned'
  | 'unverified'
  | 'type_corrected';

/** 채널 상태 변화 이벤트 */
@Entity('channel_events')
@Index('idx_channel_events_channel', ['channelId'])
export class ChannelEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ type: 'varchar', length: 32 })
  type: ChannelEventType;

  @Column({ type: 'varchar', length: 512, nullable: true })
  before: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  after: string | null;

  @Column({ name: 'occurred_at', type: dateTimeColumnType() })
  occurredAt: Date;
}
