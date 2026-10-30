import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';
import { bigintNumberRequiredTransformer } from '../common/bigint-transformer';

export type MemberActivityKind =
  | 'search'
  | 'open'
  | 'view'
  | 'favorite'
  | 'category';

/**
 * 로그인 회원의 활동 기록(성향 파악용). 어드민만 본다. 90일 지나면 지우고, 회원을 지우면 같이 지운다.
 * 그룹 대화 내용 같은 텔레그램 쪽 데이터는 넣지 않는다 — 우리 사이트에서 한 행동만.
 */
@Entity('member_activities')
@Index('idx_member_activities_user_time', ['telegramId', 'createdAt'])
@Index('idx_member_activities_time', ['createdAt'])
export class MemberActivity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({
    name: 'telegram_id',
    type: 'bigint',
    transformer: bigintNumberRequiredTransformer,
  })
  telegramId: number;

  @Column({ type: 'varchar', length: 12 })
  kind: MemberActivityKind;

  @Column({ name: 'channel_id', type: 'varchar', length: 36, nullable: true })
  channelId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  keyword: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}
