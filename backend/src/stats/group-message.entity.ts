import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/**
 * 그룹(회원끼리 대화하는 방)의 최근 대화. 수집할 때마다 그 그룹 몫을 통째로 바꿔 끼운다(최근 50개 + 고정글).
 *
 * 저장 규칙: 보낸 사람(이름·아이디·텔레그램 ID)은 저장하지 않는다. 본문은 개인정보(전화·계좌·이메일·
 * @아이디·메신저 아이디)를 가린 뒤에만 저장한다(원문 저장 안 함).
 */
@Entity('group_messages')
@Index('idx_group_messages_channel', ['channelId'])
export class GroupMessage {
  @PrimaryColumn({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @PrimaryColumn({ name: 'message_id', type: 'integer' })
  messageId: number;

  @Column({ name: 'posted_at', type: dateTimeColumnType() })
  postedAt: Date;

  /** 개인정보를 가린 본문(최대 1000자). 사진만 있는 글이면 null */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  text: string | null;

  @Column({ name: 'media_type', type: 'varchar', length: 20, default: 'text' })
  mediaType: string;

  /** 익명 운영자 또는 채널 이름으로 올린 글(운영자 공지로 본다) */
  @Column({ name: 'is_admin_post', type: 'boolean', default: false })
  isAdminPost: boolean;

  /** 그룹 상단 고정 글 */
  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'collected_at', type: dateTimeColumnType() })
  collectedAt: Date;
}
