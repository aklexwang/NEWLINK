import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 어드민 종 알림. key 가 같으면 한 번만 만든다 */
@Entity('admin_notifications')
export class AdminNotification {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  body: string | null;

  /** 누르면 갈 어드민 경로 (예: /admin/categories) */
  @Column({ type: 'varchar', length: 200, nullable: true })
  link: string | null;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @Column({ name: 'read_at', type: dateTimeColumnType(), nullable: true })
  readAt: Date | null;
}
