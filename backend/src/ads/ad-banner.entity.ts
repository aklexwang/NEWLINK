import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { binaryColumnType, dateTimeColumnType } from '../common/db-types';

/**
 * 홈 배너 광고. 이미지는 DB 에 저장한다(서버 파일은 배포 때 사라질 수 있음).
 * 누르면 link(텔레그램 방)로 이동.
 */
@Entity('ad_banners')
export class AdBanner {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  /** 누르면 이동할 텔레그램 링크 */
  @Column({ type: 'varchar', length: 512 })
  link: string;

  @Column({ name: 'image_mime', type: 'varchar', length: 40 })
  imageMime: string;

  @Column({ name: 'image_data', type: binaryColumnType(), select: false })
  imageData: Buffer;

  /** 이미지가 바뀔 때마다 바뀌는 값(캐시 무효화용) */
  @Column({ name: 'image_version', type: 'varchar', length: 20 })
  imageVersion: string;

  @Column({ name: 'starts_at', type: dateTimeColumnType(), nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: dateTimeColumnType(), nullable: true })
  endsAt: Date | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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
