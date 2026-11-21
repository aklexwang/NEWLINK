import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 보낸 기록(성공·실패) */
@Entity('promo_post_logs')
@Index('idx_promo_post_logs_posted', ['postedAt'])
export class PromoPostLog {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'target_id', type: 'varchar', length: 36 })
  targetId: string;

  @Column({ name: 'target_title', type: 'varchar', length: 200 })
  targetTitle: string;

  @Column({ name: 'creative_id', type: 'varchar', length: 36, nullable: true })
  creativeId: string | null;

  @Column({ name: 'posted_at', type: dateTimeColumnType() })
  postedAt: Date;

  @Column({ type: 'boolean', default: false })
  ok: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  error: string | null;

  /** auto | manual */
  @Column({ type: 'varchar', length: 10, default: 'auto' })
  kind: string;
}
