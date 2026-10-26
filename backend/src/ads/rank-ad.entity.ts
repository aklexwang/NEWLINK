import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** global: 모든 카테고리(전체 포함) 목록 1~5위 / category: 그 카테고리 목록 1~5위 */
export type RankAdScope = 'global' | 'category';

/** 텔레그램방 순위 광고: 정한 기간 동안 목록의 slot 번째 자리에 고정해서 보여 준다 */
@Entity('rank_ads')
export class RankAd {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @Column({ type: 'varchar', length: 10 })
  scope: RankAdScope;

  /** scope=category 일 때 대상 카테고리 이름 */
  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  /** 1~5 */
  @Column({ type: 'integer' })
  slot: number;

  @Column({ name: 'starts_at', type: dateTimeColumnType(), nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: dateTimeColumnType(), nullable: true })
  endsAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 광고주·메모 (관리용) */
  @Column({ type: 'varchar', length: 200, nullable: true })
  memo: string | null;

  @Column({ type: 'integer', default: 0 })
  clicks: number;

  /** 받은 광고비 (USDT) */
  @Column({ name: 'paid_usdt', type: 'real', nullable: true })
  paidUsdt: number | null;

  /** 광고비 받은 날 'YYYY-MM-DD' (KST) */
  @Column({ name: 'paid_on', type: 'varchar', length: 10, nullable: true })
  paidOn: string | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
