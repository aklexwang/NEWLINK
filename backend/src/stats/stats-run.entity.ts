import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';
import type { StatsCollectMode } from './stats-collect.logic';
import type { StatsRunEndedReason } from './stats-run.logic';

/** 통계 수집 파이프라인 1회 실행 */
@Entity('stats_runs')
export class StatsRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'started_at', type: dateTimeColumnType() })
  startedAt: Date;

  @Column({ name: 'finished_at', type: dateTimeColumnType(), nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  processed: number;

  @Column({ type: 'integer', default: 0 })
  total: number;

  @Column({ name: 'ended_reason', type: 'varchar', length: 32, nullable: true })
  endedReason: StatsRunEndedReason | null;

  @Column({ type: 'varchar', length: 16, default: 'full' })
  mode: StatsCollectMode;
}
