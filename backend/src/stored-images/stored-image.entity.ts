import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { binaryColumnType, dateTimeColumnType } from '../common/db-types';

/**
 * 관리자가 올린 이미지(카테고리 아이콘·방 프로필 등).
 * 서버 파일 폴더는 배포 때 지워지므로 DB 에 저장한다.
 */
@Entity('stored_images')
export class StoredImage {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  /** category-icon | channel-avatar */
  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 40 })
  mime: string;

  @Column({ type: binaryColumnType(), select: false })
  data: Buffer;

  @CreateDateColumn({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
