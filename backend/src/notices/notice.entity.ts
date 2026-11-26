import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 회원 공지 (어드민에서 쓰고, 회원 화면 [공지] 에서 본다) */
@Entity('notices')
export class Notice {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 4000, default: '' })
  body: string;

  /** 맨 위 고정 */
  @Column({ type: 'boolean', default: false })
  pinned: boolean;

  /** 회원에게 보이는지 */
  @Column({ type: 'boolean', default: true })
  published: boolean;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}
