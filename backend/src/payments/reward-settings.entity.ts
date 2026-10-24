import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

@Entity('reward_settings')
export class RewardSettings {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
