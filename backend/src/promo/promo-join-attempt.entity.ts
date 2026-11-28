import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 홍보 계정 자동 가입 기록(방마다 한 번만 시도) */
@Entity('promo_join_attempts')
@Index('idx_promo_join_attempts_at', ['attemptedAt'])
export class PromoJoinAttempt {
  /** 우리 DB 방(channels.id) */
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** joined: 들어감 · requested: 가입 신청(승인 대기) · failed: 못 들어감 */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  error: string | null;

  @Column({ name: 'attempted_at', type: dateTimeColumnType() })
  attemptedAt: Date;
}
