import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';
import type { ReclassifyRowStatus } from './category-reclassify.logic';

/**
 * 전체 재분류 미리보기 한 줄. 미리보기 때 채널마다 1줄씩 쌓고(same 포함),
 * 관리자가 적용하면 pending → applied/skipped 로 바뀐다. 실제 카테고리는 적용 때만 바뀐다.
 */
@Entity('category_proposals')
@Index('idx_category_proposals_batch', ['batchId', 'status'])
export class CategoryProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'batch_id', type: 'varchar', length: 36 })
  batchId: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Column({ name: 'before_category', type: 'varchar', length: 100 })
  beforeCategory: string;

  @Column({ name: 'after_category', type: 'varchar', length: 100 })
  afterCategory: string;

  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  /** ai | fallback */
  @Column({ type: 'varchar', length: 16 })
  source: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: ReclassifyRowStatus;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
