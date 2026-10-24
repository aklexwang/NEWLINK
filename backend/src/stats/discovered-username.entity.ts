import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

export type DiscoveredUsernameResult =
  | 'queued'
  | 'added'
  | 'not_korean'
  | 'too_small'
  | 'not_found'
  | 'invite_or_private'
  | 'discarded'
  | 'already_registered';

/** 눈덩이 발견에서 이미 검사한 아이디 (30일 후 재검사) */
@Entity('discovered_usernames')
export class DiscoveredUsername {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 20 })
  result: DiscoveredUsernameResult;

  @Column({ name: 'checked_at', type: dateTimeColumnType() })
  checkedAt: Date;

  @Column({ name: 'mention_count', type: 'integer', default: 0 })
  mentionCount: number;

  /** snowball = 서버 자동 발견. 없으면 PC 대량 도구 등 */
  @Column({ type: 'varchar', length: 20, nullable: true })
  source: string | null;
}
