import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

export type ChannelPostMediaType =
  | 'text'
  | 'photo'
  | 'video'
  | 'file'
  | 'other';

/** 채널에서 관측한 게시물 */
@Entity('channel_posts')
@Unique('uq_channel_posts_channel_message', ['channelId', 'messageId'])
@Index('idx_channel_posts_channel', ['channelId'])
export class ChannelPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @Column({ name: 'message_id', type: 'integer' })
  messageId: number;

  @Column({ name: 'posted_at', type: dateTimeColumnType() })
  postedAt: Date;

  @Column({ type: 'integer', nullable: true })
  views: number | null;

  @Column({ name: 'media_type', type: 'varchar', length: 20, default: 'text' })
  mediaType: ChannelPostMediaType;

  @Column({
    name: 'forwarded_from',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  forwardedFrom: string | null;

  /** 본문 t.me 링크에서 뽑은 아이디 (쉼표 구분) */
  @Column({ name: 'mentioned_usernames', type: 'text', nullable: true })
  mentionedUsernames: string | null;

  /** 언어 판별용 본문 앞부분 */
  @Column({ name: 'text_excerpt', type: 'varchar', length: 200, nullable: true })
  textExcerpt: string | null;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ name: 'last_seen_at', type: dateTimeColumnType() })
  lastSeenAt: Date;

  /** 최근 수집에서 구간 안에 사라진 글 */
  @Column({ name: 'deleted_at', type: dateTimeColumnType(), nullable: true })
  deletedAt: Date | null;
}
