import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

@Entity('discovery_keywords')
export class DiscoveryKeyword {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  word: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  sort: number;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @Column({
    name: 'last_searched_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  lastSearchedAt: Date | null;

  @Column({ name: 'last_found_count', type: 'integer', nullable: true })
  lastFoundCount: number | null;

  @Column({ name: 'total_new_count', type: 'integer', default: 0 })
  totalNewCount: number;
}
