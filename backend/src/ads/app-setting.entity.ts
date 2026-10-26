import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 작은 설정 값 모음(키-값). 예: 배너 넘김 간격 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 500 })
  value: string;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
