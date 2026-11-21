import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/**
 * 홍보할 방(홍보 계정이 들어가 있는 그룹). 방마다 하루 횟수·간격을 따로 둔다.
 * status: ok | room_blocked(강퇴·글쓰기 막힘·나감) | gone(목록에서 사라짐)
 */
@Entity('promo_targets')
@Index('uq_promo_targets_peer', ['peerType', 'peerId'], { unique: true })
export class PromoTarget {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  /** channel(슈퍼그룹) | chat(옛 그룹) */
  @Column({ name: 'peer_type', type: 'varchar', length: 10 })
  peerType: string;

  @Column({ name: 'peer_id', type: 'varchar', length: 30 })
  peerId: string;

  @Column({ name: 'access_hash', type: 'varchar', length: 40, nullable: true })
  accessHash: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({ name: 'member_count', type: 'integer', nullable: true })
  memberCount: number | null;

  /** 방 소개글(규칙 읽기용, 앞부분만) */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  about: string | null;

  /** 소개글에서 찾은 규칙 문구(화면 표시) */
  @Column({ name: 'rule_text', type: 'varchar', length: 200, nullable: true })
  ruleText: string | null;

  /** 소개글에 홍보 금지로 보이는 문구가 있음 */
  @Column({ name: 'rule_forbidden', type: 'boolean', default: false })
  ruleForbidden: boolean;

  /** 관리자가 켠 방만 보낸다(처음엔 꺼짐 = 확인 필요) */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'daily_limit', type: 'integer', default: 1 })
  dailyLimit: number;

  @Column({ name: 'min_gap_minutes', type: 'integer', default: 720 })
  minGapMinutes: number;

  /** 사진을 못 올리는 방이면 글만 */
  @Column({ name: 'text_only', type: 'boolean', default: false })
  textOnly: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ok' })
  status: string;

  @Column({ name: 'last_error', type: 'varchar', length: 120, nullable: true })
  lastError: string | null;

  @Column({
    name: 'last_posted_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  lastPostedAt: Date | null;

  /** 슬로우 모드 등으로 이때까지 이 방은 쉼 */
  @Column({
    name: 'next_allowed_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  nextAllowedAt: Date | null;

  @Column({
    name: 'last_creative_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  lastCreativeId: string | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
