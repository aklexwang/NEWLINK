import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

export type AdminInspectJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'interrupted';

@Entity('admin_inspect_jobs')
export class AdminInspectJob {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  status: AdminInspectJobStatus;

  @Column({ type: 'integer', default: 0 })
  processed: number;

  @Column({ type: 'integer', default: 0 })
  total: number;

  @Column({ name: 'ended_reason', type: 'varchar', length: 32, nullable: true })
  endedReason: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @Column({ name: 'started_at', type: dateTimeColumnType(), nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: dateTimeColumnType(), nullable: true })
  finishedAt: Date | null;
}
