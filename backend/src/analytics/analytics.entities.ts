import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { dateTimeColumnType } from '../common/db-types';

/** 검색 금지어·예외어 (어드민 설정) */
@Index('uq_search_terms_kind_norm', ['kind', 'termNormalized'], {
  unique: true,
})
@Entity('search_terms')
export class SearchTerm {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  /** 'block' | 'allow' */
  @Column({ type: 'varchar', length: 10 })
  kind: string;

  /** 어드민이 입력한 원문 */
  @Column({ type: 'varchar', length: 64 })
  term: string;

  /** 비교용 정규화 값 */
  @Column({ name: 'term_normalized', type: 'varchar', length: 64 })
  termNormalized: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;

  @Column({ name: 'updated_at', type: dateTimeColumnType() })
  updatedAt: Date;
}

/** 검색 기록 원본(익명). 회원 ID·IP 는 저장하지 않는다. */
@Index('idx_search_logs_created_at', ['createdAt'])
@Entity('search_logs')
export class SearchLog {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'query_normalized', type: 'varchar', length: 100 })
  queryNormalized: string;

  @Column({ name: 'query_raw', type: 'varchar', length: 100 })
  queryRaw: string;

  @Column({ name: 'result_count', type: 'integer', default: 0 })
  resultCount: number;

  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  /** 한국시간 기준 날짜 (YYYY-MM-DD) */
  @Column({ name: 'searched_on', type: 'varchar', length: 10 })
  searchedOn: string;

  @Column({ name: 'created_at', type: dateTimeColumnType() })
  createdAt: Date;
}

/** 일별·검색어별 집계 */
@Entity('search_daily_stats')
export class SearchDailyStat {
  @PrimaryColumn({ name: 'stat_date', type: 'varchar', length: 10 })
  statDate: string;

  @PrimaryColumn({ name: 'query_normalized', type: 'varchar', length: 100 })
  queryNormalized: string;

  @Column({ name: 'search_count', type: 'integer', default: 0 })
  searchCount: number;

  @Column({ name: 'zero_count', type: 'integer', default: 0 })
  zeroCount: number;

  @Column({ name: 'blocked_count', type: 'integer', default: 0 })
  blockedCount: number;
}

/** 같은 사람이 같은 채널을 1시간 안에 다시 눌렀는지 보는 임시 표 */
@Index('idx_telegram_open_recent_at', ['lastCountedAt'])
@Entity('telegram_open_recent')
export class TelegramOpenRecent {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  @PrimaryColumn({ name: 'visitor_hash', type: 'varchar', length: 64 })
  visitorHash: string;

  @Column({ name: 'last_counted_at', type: dateTimeColumnType() })
  lastCountedAt: Date;
}

/** 채널별 일별 "텔레그램에서 열기" 수 */
@Index('idx_channel_open_daily_date', ['openDate'])
@Entity('channel_open_daily')
export class ChannelOpenDaily {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 36 })
  channelId: string;

  /** 한국시간 기준 날짜 (YYYY-MM-DD) */
  @PrimaryColumn({ name: 'open_date', type: 'varchar', length: 10 })
  openDate: string;

  @Column({ name: 'open_count', type: 'integer', default: 0 })
  openCount: number;
}

export const ANALYTICS_ENTITIES = [
  SearchTerm,
  SearchLog,
  SearchDailyStat,
  TelegramOpenRecent,
  ChannelOpenDaily,
];
