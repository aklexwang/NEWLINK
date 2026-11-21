import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 홍보 글(문구 + 이미지). 여러 개를 돌려 쓴다 */
@Entity('promo_creatives')
export class PromoCreative {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 1000 })
  text: string;

  /** /api/images/<id> (없으면 글만) */
  @Column({ name: 'image_url', type: 'varchar', length: 200, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** ai | template | manual */
  @Column({ type: 'varchar', length: 12, default: 'manual' })
  source: string;

  @Column({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount: number;

  @Column({ name: 'last_sent_at', type: dateTimeColumnType(), nullable: true })
  lastSentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
