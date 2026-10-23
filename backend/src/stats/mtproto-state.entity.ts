import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** MTProto FloodWait 등 런타임 상태. 행은 하나(id=1)만 씁니다. */
@Entity('mtproto_state')
export class MtprotoState {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({
    name: 'flood_wait_started_at',
    type: dateTimeColumnType(),
    nullable: true,
  })
  floodWaitStartedAt: Date | null;

  @Column({
    name: 'flood_wait_until',
    type: dateTimeColumnType(),
    nullable: true,
  })
  floodWaitUntil: Date | null;
}
