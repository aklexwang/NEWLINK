import { Column, Entity, PrimaryColumn } from 'typeorm';

export type AdminInspectItemResult =
  | 'ok'
  | 'already_registered'
  | 'not_korean'
  /** 언어를 확인하지 못함. 경고만 하고 등록은 허용 */
  | 'language_unknown'
  | 'too_small'
  | 'not_found'
  | 'invite_or_private'
  | 'invalid_format';

@Entity('admin_inspect_items')
export class AdminInspectItem {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'job_id', type: 'varchar', length: 36 })
  jobId: string;

  @Column({ name: 'line_no', type: 'integer' })
  lineNo: number;

  @Column({ name: 'raw_input', type: 'varchar', length: 512 })
  rawInput: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  link: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  result: AdminInspectItemResult | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'member_count', type: 'integer', nullable: true })
  memberCount: number | null;

  @Column({ name: 'link_type', type: 'varchar', length: 20, nullable: true })
  linkType: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  language: string | null;

  @Column({
    name: 'registered_channel_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  registeredChannelId: string | null;
}
