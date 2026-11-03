import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';
import { bigintNumberRequiredTransformer } from '../common/bigint-transformer';

/**
 * 미니앱 방문자(로그인 안 한 비회원 포함). 텔레그램이 미니앱 서명으로 넘겨주는 정보만 — 전화번호는 받지 않는다.
 * 마지막 방문 후 90일 지나면 지운다. 어드민만 본다.
 */
@Entity('visitors')
@Index('idx_visitors_last_seen', ['lastSeenAt'])
export class Visitor {
  @PrimaryColumn({
    name: 'telegram_id',
    type: 'bigint',
    transformer: bigintNumberRequiredTransformer,
  })
  telegramId: number;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({
    name: 'language_code',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  languageCode: string | null;

  @Column({ name: 'is_premium', type: 'boolean', default: false })
  isPremium: boolean;

  @Column({ name: 'first_seen_at', type: dateTimeColumnType() })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: dateTimeColumnType() })
  lastSeenAt: Date;

  /** 방문한 날 수 (한국 날짜 기준, 하루 여러 번 열어도 1) */
  @Column({ name: 'visit_days', type: 'integer', default: 1 })
  visitDays: number;

  /** 마지막으로 센 한국 날짜 yyyy-mm-dd */
  @Column({ name: 'last_day', type: 'varchar', length: 10 })
  lastDay: string;
}
