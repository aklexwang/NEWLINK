import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

@Entity('reward_settings')
export class RewardSettings {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** 마지막으로 활성/비활성을 바꾼 시각. 이 시각 이후 제보부터 새 상태를 따른다 */
  @Column({
    name: 'enabled_changed_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  enabledChangedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
