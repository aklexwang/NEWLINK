import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 보상 활성/비활성 바꾼 기록 */
@Entity('reward_toggle_logs')
export class RewardToggleLog {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'changed_at', type: dateTimeColumnType() })
  changedAt: Date;

  /** 바꾼 관리자(아이디). 모르면 null */
  @Column({ name: 'changed_by', type: 'varchar', length: 64, nullable: true })
  changedBy: string | null;
}
